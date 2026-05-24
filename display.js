// display.js — all terminal output formatting

const K = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  gray:    '\x1b[90m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  red:     '\x1b[31m',
};

const TIER_COLORS = {
  light:    K.green,
  standard: K.blue,
  heavy:    K.yellow,
};

const TIER_LABELS = {
  light:    'haiku',
  standard: 'sonnet',
  heavy:    'opus',
};

function money(n) {
  // Always 4 decimal places, e.g. $0.0042
  return '$' + n.toFixed(4);
}

function tokens(n) {
  // Comma-separated thousands: 2100 → "2,100"
  return n.toLocaleString('en-US');
}

// ── Per-message attribution line ─────────────────────────────────────────────

/**
 * Returns the bracketed attribution line shown after every response.
 *
 * @param {string}  tier          'light' | 'standard' | 'heavy'
 * @param {number}  totalTokens   input + output tokens for this call
 * @param {number}  cost          actual USD cost of this call
 * @param {number}  sonnetCost    what the same tokens would cost on Sonnet
 */
function attribution(tier, totalTokens, cost, sonnetCost) {
  const color = TIER_COLORS[tier] ?? K.gray;
  const label = TIER_LABELS[tier] ?? tier;

  let delta = '';
  if (tier === 'light') {
    const saved = sonnetCost - cost;
    if (saved > 0.000001) {
      delta = ` · ${K.green}saved ${money(saved)} vs Sonnet${K.reset}${color}`;
    }
  } else if (tier === 'heavy') {
    const premium = cost - sonnetCost;
    if (premium > 0.000001) {
      delta = ` · ${K.yellow}${money(premium)} more than Sonnet${K.reset}${color}`;
    }
  }
  // standard: no delta shown (it IS Sonnet)

  return `${color}[${label} · ${tokens(totalTokens)} tokens · ${money(cost)}${delta}]${K.reset}`;
}

// ── Session summary ───────────────────────────────────────────────────────────

const DIV = `${K.gray}─────────────────────────────${K.reset}`;

/**
 * @param {object} stats          { light, standard, heavy, classifier } — each: { messages, cost }
 * @param {number} sonnetBaseline total cost if every main message had used Sonnet
 */
function sessionSummary(stats, sonnetBaseline) {
  const lines = ['', DIV, `${K.bold}Session summary${K.reset}`, DIV];

  const tiers = [
    ['light',    'Haiku'],
    ['standard', 'Sonnet'],
    ['heavy',    'Opus'],
  ];

  let actualCost = 0;
  let anyMessages = false;

  for (const [tier, displayName] of tiers) {
    const s = stats[tier];
    if (!s || s.messages === 0) continue;
    anyMessages = true;
    actualCost += s.cost;
    const label   = displayName.padEnd(14);
    const msgWord = s.messages === 1 ? '1 message ' : `${s.messages} messages`;
    lines.push(`  ${label}${msgWord} · ${money(s.cost)}`);
  }

  // Classifier is real spend even though it's invisible to the user
  if (stats.classifier?.cost > 0) {
    actualCost += stats.classifier.cost;
  }

  if (!anyMessages) {
    lines.push('  (no messages sent)');
    lines.push(DIV, '');
    return lines.join('\n');
  }

  const saved    = sonnetBaseline - actualCost;
  const savedPct = sonnetBaseline > 0
    ? Math.round(Math.abs(saved / sonnetBaseline) * 100)
    : 0;

  lines.push(DIV);
  lines.push(`  ${'Actual cost:'.padEnd(18)}  ${money(actualCost)}`);
  lines.push(`  ${'If all Sonnet:'.padEnd(18)}  ${money(sonnetBaseline)}`);

  if (saved > 0.000001) {
    lines.push(
      `  ${K.green}${'You saved:'.padEnd(18)}  ${money(saved)}  (${savedPct}%)${K.reset}`
    );
  } else if (saved < -0.000001) {
    lines.push(
      `  ${K.yellow}${'You spent extra:'.padEnd(18)}  ${money(-saved)}  (${savedPct}% over Sonnet)${K.reset}`
    );
  } else {
    lines.push(`  ${'No difference'.padEnd(18)}`);
  }

  lines.push(DIV, '');
  return lines.join('\n');
}

// ── router costs report ───────────────────────────────────────────────────────

function costsReport(entries, label) {
  const messages = entries.filter(e => e.type === 'message' && e.tier !== 'classifier');

  if (messages.length === 0) {
    return `\nNo data found for ${label}.\n`;
  }

  // Aggregate by model
  const byModel = {};
  let totalCost      = 0;
  let sonnetBaseline = 0;

  for (const e of entries.filter(e => e.type === 'message')) {
    const key = e.model ?? e.tier ?? 'unknown';
    if (!byModel[key]) byModel[key] = { messages: 0, cost: 0 };
    if (e.tier !== 'classifier') byModel[key].messages++;
    byModel[key].cost += e.cost ?? 0;
    totalCost += e.cost ?? 0;
    if (e.tier !== 'classifier') sonnetBaseline += e.sonnetCost ?? e.cost ?? 0;
  }

  const lines = ['', DIV, `${K.bold}Cost report — ${label}${K.reset}`, DIV];

  for (const [model, data] of Object.entries(byModel)) {
    const short = model.includes('haiku')  ? 'Haiku'
                : model.includes('sonnet') ? 'Sonnet'
                : model.includes('opus')   ? 'Opus'
                : model;
    const msgWord = data.messages === 1 ? '1 message ' : `${data.messages} messages`;
    lines.push(`  ${short.padEnd(14)}${msgWord} · ${money(data.cost)}`);
  }

  const saved    = sonnetBaseline - totalCost;
  const savedPct = sonnetBaseline > 0
    ? Math.round(Math.abs(saved / sonnetBaseline) * 100)
    : 0;

  lines.push(DIV);
  lines.push(`  ${'Actual cost:'.padEnd(18)}  ${money(totalCost)}`);
  lines.push(`  ${'If all Sonnet:'.padEnd(18)}  ${money(sonnetBaseline)}`);

  if (saved > 0.000001) {
    lines.push(
      `  ${K.green}${'You saved:'.padEnd(18)}  ${money(saved)}  (${savedPct}%)${K.reset}`
    );
  } else if (saved < -0.000001) {
    lines.push(
      `  ${K.yellow}${'You spent extra:'.padEnd(18)}  ${money(-saved)}  (${savedPct}% over Sonnet)${K.reset}`
    );
  }

  lines.push(DIV, '');
  return lines.join('\n');
}

// ── router history ────────────────────────────────────────────────────────────

function historyReport(entries) {
  const messages = entries.filter(e => e.type === 'message' && e.tier !== 'classifier');
  if (messages.length === 0) return '\nNo history found.\n';

  // Group by session
  const sessions = {};
  for (const e of entries.filter(e => e.type === 'message')) {
    if (!sessions[e.session]) sessions[e.session] = [];
    sessions[e.session].push(e);
  }

  const ids    = Object.keys(sessions).sort();
  const recent = ids.slice(-20);  // last 20 sessions

  const lines = ['', DIV, `${K.bold}Recent sessions${K.reset}`, DIV];

  for (const sid of recent) {
    const msgs    = sessions[sid];
    const userMsg = msgs.filter(e => e.tier !== 'classifier');
    const ts      = new Date(msgs[0].ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const cost    = msgs.reduce((s, e) => s + (e.cost ?? 0), 0);
    const count   = userMsg.length;
    const word    = count === 1 ? '1 msg' : `${count} msgs`;
    lines.push(`  ${K.gray}${ts}${K.reset}  ${word.padEnd(7)}  ${K.green}${money(cost)}${K.reset}`);
  }

  lines.push(DIV, '');
  return lines.join('\n');
}

module.exports = { attribution, sessionSummary, costsReport, historyReport, K, money };
