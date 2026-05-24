// api.js — Anthropic client wrapper

const Anthropic = require('@anthropic-ai/sdk');
const { K } = require('./display');

let _client = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(`\n${K.red}Error: ANTHROPIC_API_KEY is not set.${K.reset}`);
      console.error(`  export ANTHROPIC_API_KEY=sk-ant-...`);
      console.error(`  Get your key → https://console.anthropic.com/\n`);
      process.exit(1);
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Stream a chat completion to stdout.
 * Returns { content: string, usage: { input_tokens, output_tokens }, stopReason: string }
 */
async function chatStream(messages, modelId) {
  const client = getClient();
  const stream = client.messages.stream({
    model:      modelId,
    max_tokens: 8192,
    messages,
  });

  let fullText = '';

  stream.on('text', (text) => {
    process.stdout.write(text);
    fullText += text;
  });

  await stream.done();
  process.stdout.write('\n');

  const final = await stream.finalMessage();

  if (final.stop_reason === 'max_tokens') {
    process.stdout.write(
      `\n${K.yellow}[response truncated — max_tokens reached]${K.reset}\n`
    );
  }

  return {
    content:    fullText,
    usage:      final.usage,         // { input_tokens, output_tokens }
    stopReason: final.stop_reason,
  };
}

/**
 * Non-streaming single completion (used by classifier).
 * Returns { content: string, usage: { input_tokens, output_tokens } }
 */
async function chatOnce(messages, modelId, maxTokens = 10) {
  const client = getClient();
  const resp = await client.messages.create({
    model:      modelId,
    max_tokens: maxTokens,
    messages,
  });
  return {
    content: resp.content[0].text.trim(),
    usage:   resp.usage,
  };
}

module.exports = { getClient, chatStream, chatOnce };
