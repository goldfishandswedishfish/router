// utils.js — small pure helpers shared between index.js and tests

const OVERRIDE_RE = /^!(light|standard|heavy)\s+/i;

/**
 * If the input starts with !light / !standard / !heavy, return the tier and
 * the stripped message. Otherwise return null.
 */
function parseOverride(input) {
  const m = input.match(OVERRIDE_RE);
  if (!m) return null;
  return { tier: m[1].toLowerCase(), message: input.slice(m[0].length) };
}

module.exports = { parseOverride };
