# router

A lightweight CLI that automatically routes messages to the right Claude model (Haiku / Sonnet / Opus) based on task complexity, with real-time cost tracking.

## What it does

Every message is classified by Haiku before being sent, then routed to the appropriate model:

| Tier | Model | Used for |
|------|-------|----------|
| `light` | Haiku 4.5 | Drafts, rewrites, formatting, simple lookups |
| `standard` | Sonnet 4.6 | Research, analysis, general conversation |
| `heavy` | Opus 4.7 | Coding, architecture, multi-step reasoning |

Every response shows actual cost and savings vs. always using Sonnet:
```
[haiku · 312 tokens · $0.0001 · saved $0.0009 vs Sonnet]
```

## Setup

**Requirements:** Node.js 18+, an [Anthropic API key](https://console.anthropic.com/)

```bash
git clone <this repo>
cd router
npm install
npm link          # makes `router` available globally
```

Set your API key:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or use 1Password CLI (recommended):
```bash
# Add to ~/.router/.env:
ANTHROPIC_API_KEY=op://Vault/Item/field

# Add alias to your shell profile:
alias router='op run --env-file ~/.router/.env -- router'
```

## Usage

```bash
router                              # interactive session
router ask "draft a follow-up email"
router ask !heavy "refactor this"   # force Opus
router costs --week                 # spending report
router costs --month
router history                      # recent sessions
router config                       # show models + pricing
```

**In the interactive session:**
- Prefix any message with `!light`, `!standard`, or `!heavy` to force a model
- `/clear` — reset conversation history
- `/stats` — show cost so far mid-session
- `exit` or `Ctrl+C` — show session summary and quit

## Session summary

```
─────────────────────────────
Session summary
─────────────────────────────
Haiku:         9 messages · $0.0014
Sonnet:        4 messages · $0.0341
Opus:          1 message  · $0.0315
─────────────────────────────
Actual cost:        $0.0670
If all Sonnet:      $0.1820
You saved:          $0.1150  (63%)
─────────────────────────────
```

## Data files

All data stays local:

- `~/.router/config.json` — model IDs and pricing (edit to update when prices change)
- `~/.router/costs.jsonl` — append-only log of every API call

## Updating prices

Edit `~/.router/config.json` — no code change needed:

```json
"pricing": {
  "claude-haiku-4-5-20251001": { "input": 0.80, "output": 4.00 },
  "claude-sonnet-4-6":         { "input": 3.00, "output": 15.00 },
  "claude-opus-4-7":           { "input": 15.00, "output": 75.00 }
}
```
