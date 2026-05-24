#!/usr/bin/env node
// index.js — entry point: interactive REPL + CLI subcommands

'use strict';

const readline = require('readline');
const { load: loadConfig, CONFIG_PATH, COSTS_PATH } = require('./config');
const { calcCost, logMessage, readAll, filterByDays } = require('./costs');
const { classify }  = require('./classifier');
const { chatStream } = require('./api');
const {
  attribution, sessionSummary, costsReport, historyReport, K,
} = require('./display');
const { parseOverride } = require('./utils');

// ── Session state ─────────────────────────────────────────────────────────────

function newSessionState() {
  return {
    id:      Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    history: [],           // [{ role, content }, ...]
    stats: {
      light:      { messages: 0, cost: 0 },
      standard:   { messages: 0, cost: 0 },
      heavy:      { messages: 0, cost: 0 },
      classifier: { messages: 0, cost: 0 },
    },
    sonnetBaseline: 0,     // what every message would have cost on Sonnet
  };
}

// ── Core message processor ────────────────────────────────────────────────────

/**
 * Classify (or honour override), call the API, update stats, print attribution.
 * Mutates `session` in place.
 */
async function processMessage(rawInput, session) {
  const cfg = loadConfig();

  const override    = parseOverride(rawInput);
  const userMessage = override ? override.message : rawInput;

  // ── Classify ───────────────────────────────────────────────────────────────
  let tier;
  let classifierUsage = null;

  if (override) {
    tier = override.tier;
    process.stdout.write(`${K.gray}[forced: ${tier}]${K.reset}\n`);
  } else {
    process.stdout.write(`${K.gray}classifying…${K.reset}\r`);
    const result = await classify(userMessage);
    process.stdout.write('              \r');    // erase the line
    tier             = result.tier;
    classifierUsage  = result.usage;
  }

  // ── API call ───────────────────────────────────────────────────────────────
  const modelId       = cfg.models[tier];
  const modelPricing  = cfg.pricing[modelId];
  const sonnetPricing = cfg.pricing[cfg.models.standard];

  session.history.push({ role: 'user', content: userMessage });
  process.stdout.write('\n');

  const { content, usage } = await chatStream(session.history, modelId);

  session.history.push({ role: 'assistant', content });

  // ── Cost accounting ────────────────────────────────────────────────────────
  const { input_tokens: inTok, output_tokens: outTok } = usage;
  const cost       = calcCost(inTok, outTok, modelPricing);
  const sonnetCost = calcCost(inTok, outTok, sonnetPricing);

  session.stats[tier].messages++;
  session.stats[tier].cost += cost;
  session.sonnetBaseline   += sonnetCost;

  logMessage({
    type: 'message', ts: new Date().toISOString(), session: session.id,
    model: modelId, tier, in: inTok, out: outTok, cost, sonnetCost,
  });

  // Classifier is a real API call — track it too
  if (classifierUsage) {
    const classifierModel   = cfg.models.classifier;
    const classifierPricing = cfg.pricing[classifierModel];
    const cCost = calcCost(
      classifierUsage.input_tokens,
      classifierUsage.output_tokens,
      classifierPricing,
    );
    session.stats.classifier.messages++;
    session.stats.classifier.cost += cCost;
    session.sonnetBaseline += calcCost(
      classifierUsage.input_tokens,
      classifierUsage.output_tokens,
      sonnetPricing,
    );
    logMessage({
      type: 'message', ts: new Date().toISOString(), session: session.id,
      model: classifierModel, tier: 'classifier',
      in:   classifierUsage.input_tokens,
      out:  classifierUsage.output_tokens,
      cost: cCost,
      sonnetCost: calcCost(
        classifierUsage.input_tokens,
        classifierUsage.output_tokens,
        sonnetPricing,
      ),
    });
  }

  // ── Print attribution ──────────────────────────────────────────────────────
  const totalTokens = inTok + outTok;
  console.log(attribution(tier, totalTokens, cost, sonnetCost));
  console.log();
}

// ── Interactive REPL ──────────────────────────────────────────────────────────

async function startInteractive() {
  const session = newSessionState();

  console.log(
    `\n${K.bold}router${K.reset}  ${K.gray}Claude model router · type ${K.reset}${K.cyan}exit${K.reset}${K.gray} to quit, ${K.reset}${K.cyan}!light${K.reset}${K.gray}/${K.reset}${K.cyan}!standard${K.reset}${K.gray}/${K.reset}${K.cyan}!heavy${K.reset}${K.gray} to force a model${K.reset}\n`
  );

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  // Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n');
    console.log(sessionSummary(session.stats, session.sonnetBaseline));
    process.exit(0);
  });

  const prompt = () => {
    rl.question(`${K.cyan}❯${K.reset} `, async (raw) => {
      const input = raw.trim();

      if (!input) {
        prompt();
        return;
      }

      // Built-in REPL commands
      if (input === 'exit' || input === 'quit' || input === '/exit') {
        console.log(sessionSummary(session.stats, session.sonnetBaseline));
        rl.close();
        process.exit(0);
      }

      if (input === '/clear' || input === '!clear') {
        session.history = [];
        console.log(`${K.gray}[conversation cleared]${K.reset}\n`);
        prompt();
        return;
      }

      if (input === '/stats' || input === '!stats') {
        console.log(sessionSummary(session.stats, session.sonnetBaseline));
        prompt();
        return;
      }

      if (input === '/help' || input === '!help' || input === '?') {
        printHelp();
        prompt();
        return;
      }

      try {
        await processMessage(input, session);
      } catch (err) {
        console.error(`\n${K.red}API error: ${err.message}${K.reset}\n`);
      }

      prompt();
    });
  };

  rl.on('close', () => {
    // fired on EOF (piped input ending)
    console.log(sessionSummary(session.stats, session.sonnetBaseline));
    process.exit(0);
  });

  prompt();
}

// ── Single-shot mode ──────────────────────────────────────────────────────────

async function runAsk(message) {
  const session = newSessionState();
  try {
    await processMessage(message, session);
  } catch (err) {
    console.error(`${K.red}Error: ${err.message}${K.reset}`);
    process.exit(1);
  }
}

// ── Subcommand: costs ─────────────────────────────────────────────────────────

function cmdCosts(args) {
  const flag = args[0] ?? '--all';
  const entries = readAll();
  let filtered, label;

  if (flag === '--week') {
    filtered = filterByDays(entries, 7);
    label    = 'last 7 days';
  } else if (flag === '--month') {
    filtered = filterByDays(entries, 30);
    label    = 'last 30 days';
  } else {
    filtered = entries;
    label    = 'all time';
  }

  console.log(costsReport(filtered, label));
}

// ── Subcommand: history ───────────────────────────────────────────────────────

function cmdHistory() {
  console.log(historyReport(readAll()));
}

// ── Subcommand: config ────────────────────────────────────────────────────────

function cmdConfig() {
  const cfg = loadConfig();
  const { K: _ } = require('./display');   // already imported above

  console.log(`\n${K.bold}Configuration${K.reset}  ${K.gray}${CONFIG_PATH}${K.reset}\n`);

  console.log(`${K.bold}Models:${K.reset}`);
  for (const [tier, model] of Object.entries(cfg.models)) {
    console.log(`  ${tier.padEnd(12)} ${K.cyan}${model}${K.reset}`);
  }

  console.log(`\n${K.bold}Pricing${K.reset} ${K.gray}(per 1M tokens):${K.reset}`);
  for (const [model, p] of Object.entries(cfg.pricing)) {
    const short = model.includes('haiku')  ? 'Haiku'
                : model.includes('sonnet') ? 'Sonnet'
                : model.includes('opus')   ? 'Opus'
                : model;
    console.log(
      `  ${short.padEnd(10)} input ${K.green}$${p.input.toFixed(2)}${K.reset}` +
      `  output ${K.yellow}$${p.output.toFixed(2)}${K.reset}`
    );
  }

  console.log(`\n${K.bold}Costs log:${K.reset}  ${K.gray}${COSTS_PATH}${K.reset}\n`);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${K.bold}router${K.reset} — Claude model router with automatic cost tracking

${K.bold}Usage:${K.reset}
  ${K.cyan}router${K.reset}                        Start interactive session
  ${K.cyan}router ask${K.reset} ${K.gray}"message"${K.reset}         Single-shot query
  ${K.cyan}router ask !heavy${K.reset} ${K.gray}"message"${K.reset}  Force Opus for one query
  ${K.cyan}router costs${K.reset} ${K.gray}[--week|--month|--all]${K.reset}
  ${K.cyan}router history${K.reset}                Show recent sessions
  ${K.cyan}router config${K.reset}                 Show current config

${K.bold}In-session commands:${K.reset}
  ${K.cyan}!light${K.reset} / ${K.cyan}!standard${K.reset} / ${K.cyan}!heavy${K.reset}  Force model for next message
  ${K.cyan}/clear${K.reset}                       Clear conversation history
  ${K.cyan}/stats${K.reset}                       Show session cost so far
  ${K.cyan}exit${K.reset}                         Show summary and quit
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd  = args[0];

  switch (cmd) {
    case undefined:
    case 'new':
      await startInteractive();
      break;

    case 'ask': {
      const rest = args.slice(1).join(' ').trim();
      if (!rest) {
        console.error(`${K.red}Usage: router ask "your message"${K.reset}`);
        process.exit(1);
      }
      await runAsk(rest);
      break;
    }

    case 'costs':
      cmdCosts(args.slice(1));
      break;

    case 'history':
      cmdHistory();
      break;

    case 'config':
      cmdConfig();
      break;

    case '--help':
    case '-h':
    case 'help':
      printHelp();
      break;

    default:
      console.error(`${K.red}Unknown command: ${cmd}${K.reset}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`${K.red}Fatal: ${err.message}${K.reset}`);
  process.exit(1);
});
