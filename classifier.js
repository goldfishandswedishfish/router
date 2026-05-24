// classifier.js — ask Haiku to pick light / standard / heavy

const { load }    = require('./config');
const { chatOnce } = require('./api');

const VALID_TIERS = new Set(['light', 'standard', 'heavy']);

/**
 * Classify a user message.
 * Returns { tier: 'light'|'standard'|'heavy', usage: { input_tokens, output_tokens } }
 */
async function classify(message) {
  const cfg    = load();
  const model  = cfg.models.classifier;
  const prompt = cfg.classifierPrompt.replace('{message}', message);

  const { content, usage } = await chatOnce(
    [{ role: 'user', content: prompt }],
    model,
    10,
  );

  const tier = content.toLowerCase().replace(/[^a-z]/g, '');
  return {
    tier:  VALID_TIERS.has(tier) ? tier : 'standard',
    usage,
  };
}

module.exports = { classify };
