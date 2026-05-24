// costs.js — cost math, JSONL log, and reporting helpers

const fs = require('fs');
const { COSTS_PATH, ROUTER_DIR } = require('./config');

function ensureDir() {
  if (!fs.existsSync(ROUTER_DIR)) {
    fs.mkdirSync(ROUTER_DIR, { recursive: true });
  }
}

/** Return USD cost for a single API call. Pricing values are per-1M-tokens. */
function calcCost(inputTokens, outputTokens, modelPricing) {
  return (inputTokens  / 1_000_000) * modelPricing.input
       + (outputTokens / 1_000_000) * modelPricing.output;
}

/** Append one JSON line to costs.jsonl */
function logMessage(entry) {
  ensureDir();
  fs.appendFileSync(COSTS_PATH, JSON.stringify(entry) + '\n');
}

/** Read every line from costs.jsonl; return array of objects */
function readAll() {
  ensureDir();
  if (!fs.existsSync(COSTS_PATH)) return [];
  return fs
    .readFileSync(COSTS_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/** Keep only entries newer than `days` days */
function filterByDays(entries, days) {
  if (days == null) return entries;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter(e => new Date(e.ts).getTime() >= cutoff);
}

module.exports = { calcCost, logMessage, readAll, filterByDays };
