// config.js — read/write ~/.router/config.json

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROUTER_DIR  = path.join(os.homedir(), '.router');
const CONFIG_PATH = path.join(ROUTER_DIR, 'config.json');
const COSTS_PATH  = path.join(ROUTER_DIR, 'costs.jsonl');

const DEFAULT_CONFIG = {
  models: {
    light:      'claude-haiku-4-5-20251001',
    standard:   'claude-sonnet-4-6',
    heavy:      'claude-opus-4-7',
    classifier: 'claude-haiku-4-5-20251001',
  },
  // Prices are per 1M tokens (USD), as of May 2026
  pricing: {
    'claude-haiku-4-5-20251001': { input:  0.80, output:  4.00 },
    'claude-sonnet-4-6':         { input:  3.00, output: 15.00 },
    'claude-opus-4-7':           { input: 15.00, output: 75.00 },
  },
  classifierPrompt:
    'You are a task classifier. Given a user message, return exactly one word:\n' +
    '- "light" — message drafting, rewrites, formatting, simple lookups\n' +
    '- "standard" — research, analysis, general conversation, longer writing\n' +
    '- "heavy" — coding, debugging, architecture, multi-step technical reasoning\n\n' +
    'Respond with only the classification label. Nothing else.\n\n' +
    'Message: {message}',
};

function ensureDir() {
  if (!fs.existsSync(ROUTER_DIR)) {
    fs.mkdirSync(ROUTER_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    save(DEFAULT_CONFIG);
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  try {
    const stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // Deep-merge so new keys from DEFAULT always appear
    return {
      models:            { ...DEFAULT_CONFIG.models,   ...stored.models },
      pricing:           { ...DEFAULT_CONFIG.pricing,  ...stored.pricing },
      classifierPrompt:  stored.classifierPrompt ?? DEFAULT_CONFIG.classifierPrompt,
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function save(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, DEFAULT_CONFIG, ROUTER_DIR, CONFIG_PATH, COSTS_PATH };
