// test.js — unit tests for pure logic (no API calls required)
// Run with: npm test

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCost, filterByDays } = require('./costs');
const { attribution, sessionSummary, costsReport, money } = require('./display');
const { parseOverride } = require('./utils');
const { DEFAULT_CONFIG } = require('./config');

// Strip ANSI escape codes so we can assert on plain text
function plain(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── money() ──────────────────────────────────────────────────────────────────

describe('money()', () => {
  it('formats zero', () => assert.equal(money(0), '$0.0000'));
  it('formats small amount', () => assert.equal(money(0.0001), '$0.0001'));
  it('formats larger amount', () => assert.equal(money(0.1820), '$0.1820'));
  it('rounds to 4 decimal places', () => assert.equal(money(0.00025), '$0.0003'));
});

// ── calcCost() ────────────────────────────────────────────────────────────────

describe('calcCost()', () => {
  const haiku  = { input: 0.80, output:  4.00 };
  const sonnet = { input: 3.00, output: 15.00 };
  const opus   = { input: 15.00, output: 75.00 };

  it('returns 0 for zero tokens', () => {
    assert.equal(calcCost(0, 0, haiku), 0);
  });

  it('calculates input-only cost correctly', () => {
    // 1M input tokens at haiku input rate = $0.80
    assert.equal(calcCost(1_000_000, 0, haiku), 0.80);
  });

  it('calculates output-only cost correctly', () => {
    // 1M output tokens at haiku output rate = $4.00
    assert.equal(calcCost(0, 1_000_000, haiku), 4.00);
  });

  it('calculates haiku cost for a typical message', () => {
    // 200 input + 112 output
    // (200/1M)*0.80 + (112/1M)*4.00 = 0.00016 + 0.000448 = 0.000608
    assert.equal(calcCost(200, 112, haiku), 0.000608);
  });

  it('calculates sonnet cost for the same tokens', () => {
    // (200/1M)*3.00 + (112/1M)*15.00 = 0.0006 + 0.00168 = 0.00228
    assert.equal(calcCost(200, 112, sonnet), 0.00228);
  });

  it('sonnet costs more than haiku for same tokens', () => {
    assert.ok(calcCost(500, 500, sonnet) > calcCost(500, 500, haiku));
  });

  it('opus costs more than sonnet for same tokens', () => {
    assert.ok(calcCost(500, 500, opus) > calcCost(500, 500, sonnet));
  });
});

// ── filterByDays() ────────────────────────────────────────────────────────────

describe('filterByDays()', () => {
  const now = Date.now();
  const entries = [
    { ts: new Date(now - 10 * 86400_000).toISOString(), label: '10d ago' },
    { ts: new Date(now -  8 * 86400_000).toISOString(), label: '8d ago'  },
    { ts: new Date(now -  3 * 86400_000).toISOString(), label: '3d ago'  },
    { ts: new Date(now -  1 * 86400_000).toISOString(), label: '1d ago'  },
  ];

  it('null days returns all entries', () => {
    assert.equal(filterByDays(entries, null).length, 4);
  });

  it('filters to last 7 days', () => {
    const result = filterByDays(entries, 7);
    assert.equal(result.length, 2);
    assert.equal(result[0].label, '3d ago');
    assert.equal(result[1].label, '1d ago');
  });

  it('filters to last 30 days returns all', () => {
    assert.equal(filterByDays(entries, 30).length, 4);
  });

  it('returns empty array when nothing is recent enough', () => {
    // A negative cutoff window — nothing can be that recent
    assert.equal(filterByDays(entries, -1).length, 0);
  });
});

// ── parseOverride() ───────────────────────────────────────────────────────────

describe('parseOverride()', () => {
  it('returns null for a plain message', () => {
    assert.equal(parseOverride('what is REST?'), null);
  });

  it('parses !light prefix', () => {
    const r = parseOverride('!light write me a haiku');
    assert.equal(r.tier, 'light');
    assert.equal(r.message, 'write me a haiku');
  });

  it('parses !standard prefix', () => {
    const r = parseOverride('!standard explain OAuth2');
    assert.equal(r.tier, 'standard');
    assert.equal(r.message, 'explain OAuth2');
  });

  it('parses !heavy prefix', () => {
    const r = parseOverride('!heavy debug this routing logic');
    assert.equal(r.tier, 'heavy');
    assert.equal(r.message, 'debug this routing logic');
  });

  it('is case-insensitive', () => {
    assert.equal(parseOverride('!HEAVY do something').tier, 'heavy');
    assert.equal(parseOverride('!Light do something').tier, 'light');
  });

  it('does not match without a trailing space', () => {
    assert.equal(parseOverride('!heavy'), null);
  });

  it('does not match unknown tier', () => {
    assert.equal(parseOverride('!turbo do something'), null);
  });

  it('strips the prefix and all leading whitespace', () => {
    const r = parseOverride('!light   hello world');
    assert.equal(r.message, 'hello world');
  });
});

// ── attribution() ─────────────────────────────────────────────────────────────

describe('attribution()', () => {
  const haiku  = { input: 0.80, output:  4.00 };
  const sonnet = { input: 3.00, output: 15.00 };
  const opus   = { input: 15.00, output: 75.00 };

  it('light line contains haiku label and savings', () => {
    const cost       = calcCost(200, 112, haiku);
    const sonnetCost = calcCost(200, 112, sonnet);
    const line = plain(attribution('light', 312, cost, sonnetCost));
    assert.ok(line.includes('haiku'),       'should include model label');
    assert.ok(line.includes('312 tokens'),  'should include token count');
    assert.ok(line.includes('saved'),       'should show savings for light');
    assert.ok(line.includes('vs Sonnet'),   'should reference Sonnet');
  });

  it('standard line contains sonnet label, no delta', () => {
    const cost = calcCost(800, 440, sonnet);
    const line = plain(attribution('standard', 1240, cost, cost));
    assert.ok(line.includes('sonnet'),           'should include model label');
    assert.ok(line.includes('1,240 tokens'),     'should comma-format tokens');
    assert.ok(!line.includes('saved'),           'no savings for standard');
    assert.ok(!line.includes('more than'),       'no premium for standard');
  });

  it('heavy line contains opus label and premium', () => {
    const cost       = calcCost(1500, 600, opus);
    const sonnetCost = calcCost(1500, 600, sonnet);
    const line = plain(attribution('heavy', 2100, cost, sonnetCost));
    assert.ok(line.includes('opus'),             'should include model label');
    assert.ok(line.includes('2,100 tokens'),     'should comma-format tokens');
    assert.ok(line.includes('more than Sonnet'), 'should show Opus premium');
  });

  it('no savings shown when cost equals sonnet cost', () => {
    const line = plain(attribution('light', 100, 0.001, 0.001));
    assert.ok(!line.includes('saved'), 'no savings when costs are equal');
  });
});

// ── sessionSummary() ─────────────────────────────────────────────────────────

describe('sessionSummary()', () => {
  it('shows per-model breakdown and savings', () => {
    const stats = {
      light:      { messages: 9, cost: 0.0014 },
      standard:   { messages: 4, cost: 0.0341 },
      heavy:      { messages: 1, cost: 0.0315 },
      classifier: { messages: 14, cost: 0.0002 },
    };
    const out = plain(sessionSummary(stats, 0.1820));
    assert.ok(out.includes('Haiku'),        'shows Haiku line');
    assert.ok(out.includes('Sonnet'),       'shows Sonnet line');
    assert.ok(out.includes('Opus'),         'shows Opus line');
    assert.ok(out.includes('9 messages'),   'shows correct Haiku count');
    assert.ok(out.includes('1 message'),    'uses singular for Opus');
    assert.ok(out.includes('If all Sonnet'),'shows baseline');
    assert.ok(out.includes('You saved'),    'shows savings');
  });

  it('handles empty session gracefully', () => {
    const stats = {
      light:      { messages: 0, cost: 0 },
      standard:   { messages: 0, cost: 0 },
      heavy:      { messages: 0, cost: 0 },
      classifier: { messages: 0, cost: 0 },
    };
    const out = plain(sessionSummary(stats, 0));
    assert.ok(out.includes('no messages'), 'shows empty message');
  });

  it('shows "spent extra" when routing to Opus exceeded Sonnet baseline', () => {
    const stats = {
      light:      { messages: 0, cost: 0 },
      standard:   { messages: 0, cost: 0 },
      heavy:      { messages: 1, cost: 0.50 },
      classifier: { messages: 0, cost: 0 },
    };
    const out = plain(sessionSummary(stats, 0.10));
    assert.ok(out.includes('spent extra'), 'shows extra spend when Opus dominates');
  });
});

// ── costsReport() ─────────────────────────────────────────────────────────────

describe('costsReport()', () => {
  it('returns no-data message for empty entries', () => {
    const out = costsReport([], 'test');
    assert.ok(out.includes('No data'), 'handles empty log');
  });

  it('aggregates by model and shows savings', () => {
    const haiku  = { input: 0.80, output:  4.00 };
    const sonnet = { input: 3.00, output: 15.00 };
    const entries = [
      {
        type: 'message', ts: new Date().toISOString(), session: 'a',
        model: 'claude-haiku-4-5-20251001', tier: 'light',
        in: 200, out: 112,
        cost: calcCost(200, 112, haiku),
        sonnetCost: calcCost(200, 112, sonnet),
      },
      {
        type: 'message', ts: new Date().toISOString(), session: 'a',
        model: 'claude-sonnet-4-6', tier: 'standard',
        in: 800, out: 440,
        cost: calcCost(800, 440, sonnet),
        sonnetCost: calcCost(800, 440, sonnet),
      },
    ];
    const out = plain(costsReport(entries, 'test run'));
    assert.ok(out.includes('Haiku'),        'shows Haiku line');
    assert.ok(out.includes('Sonnet'),       'shows Sonnet line');
    assert.ok(out.includes('Actual cost'),  'shows actual cost');
    assert.ok(out.includes('If all Sonnet'),'shows baseline');
    assert.ok(out.includes('You saved'),    'shows savings');
  });
});

// ── DEFAULT_CONFIG shape ──────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('has all required model tiers', () => {
    const { models } = DEFAULT_CONFIG;
    assert.ok(models.light,      'has light model');
    assert.ok(models.standard,   'has standard model');
    assert.ok(models.heavy,      'has heavy model');
    assert.ok(models.classifier, 'has classifier model');
  });

  it('has pricing for every model', () => {
    const { models, pricing } = DEFAULT_CONFIG;
    for (const model of Object.values(models)) {
      assert.ok(pricing[model], `missing pricing for ${model}`);
      assert.ok(typeof pricing[model].input  === 'number', `${model} input price not a number`);
      assert.ok(typeof pricing[model].output === 'number', `${model} output price not a number`);
    }
  });

  it('classifier prompt contains the {message} placeholder', () => {
    assert.ok(DEFAULT_CONFIG.classifierPrompt.includes('{message}'));
  });

  it('haiku is cheaper than sonnet is cheaper than opus', () => {
    const { pricing, models } = DEFAULT_CONFIG;
    const h = pricing[models.light];
    const s = pricing[models.standard];
    const o = pricing[models.heavy];
    assert.ok(h.input  < s.input,  'haiku input < sonnet input');
    assert.ok(s.input  < o.input,  'sonnet input < opus input');
    assert.ok(h.output < s.output, 'haiku output < sonnet output');
    assert.ok(s.output < o.output, 'sonnet output < opus output');
  });
});
