# opencontroller

An Electron GUI shell for your locally-installed agent binaries. It doesn't
re-implement provider routing — it **drives the real `openclaw` and `hermes`
CLIs you already have** and gives you better visual feedback about what the
agent just did: which provider won, which model it picked, how long it took,
which tools it called, whether it fell back.

Think of it as a keyboard-summonable window that turns an agent turn into a
legible transcript instead of a wall of terminal output.

## Requirements

- macOS (ARM64 — Apple Silicon)
- [`openclaw`](https://github.com/openclaw/openclaw) on your `$PATH`
  (`brew`, `npm -g`, etc.)
- [`hermes`](https://github.com/NousResearch/hermes-agent) on your `$PATH`
  (optional — only needed if you want to drive Hermes Agent)
- Node 18+ to develop

opencontroller auto-detects both binaries and looks for `~/.openclaw/`
and `~/.hermes/` on first launch.

## Setup

```bash
npm install
npm run dev
```

## Build the ARM64 DMG

```bash
# Signed (requires Apple Developer cert in keychain)
npm run package:mac-arm

# Unsigned for local testing
npm run package:mac-unsigned
```

Output: `dist/opencontroller-0.1.0-arm64.dmg`

If macOS flags the unsigned DMG as "damaged":
```bash
xattr -cr "/Applications/opencontroller.app"
```

## How it actually works

1. **Detect.** On boot, opencontroller scans `~/.openclaw/` and `~/.hermes/`
   for a readable config, and checks that `openclaw` / `hermes` are on
   `$PATH`.
2. **Import.** If exactly one install is present it auto-imports silently,
   otherwise the wizard asks you to pick one. Import here means: read the
   config so we know the assistant's name, which provider was configured,
   and the channels in play — purely for UI display.
3. **Drive the agent.** When you send a message, opencontroller spawns:

   ```
   openclaw agent --local --agent main --message <text> --json
   ```

   or

   ```
   hermes chat -q <text> -Q
   ```

   depending on which source you imported. The JSON envelope from OpenClaw
   (or the emoji-prefixed status stream from Hermes) is parsed in the main
   process and handed to the renderer as a structured `AgentTurnResult`.
4. **Show what happened.** Under the assistant's reply you get a footer
   with `provider · model · took · tools · fallback?` — pulled straight
   from OpenClaw's `executionTrace` / `toolSummary` / `requestShaping`.
   If Hermes returns an error (bad model name, 404, rate limit), you see
   its exact status lines rendered in the chat instead of a silent failure.

No API keys ever flow through this app. It reads them from the agent's
config only to display which provider is active; the actual inference runs
through the agent binary's own credential store.

### OpenClaw (`openclaw.json`)

Matches upstream [openclaw/openclaw](https://github.com/openclaw/openclaw):

```json
{
  "gateway": { "port": 19001, "auth": { "token": "…" } },
  "channels": {
    "telegram": { "token": { "source": "env", "id": "TELEGRAM_BOT_TOKEN" } }
  },
  "models": {
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}", "model": "claude-opus-4.6" },
      "ollama-cloud": { "apiKey": "…", "baseUrl": "https://ollama.com/v1" }
    }
  },
  "agents": {
    "defaults": { "model": { "primary": "ollama-cloud/glm-5.1" } }
  }
}
```

### Hermes Agent (`config.yaml`)

Matches upstream [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent):

```yaml
model:
  default: "anthropic/claude-opus-4.6"
  provider: "openrouter"
  base_url: "https://openrouter.ai/api/v1"
personality:
  name: "TARS"
  system_prompt: "Dry, helpful, concise."
tools:
  - web_search
  - file_read
```

## Hotkeys

- **⌘⇧Space** — summon / dismiss
- **Enter** — send message

## CLI flags

- `--user-data-dir=/absolute/path` — isolate the electron-store (Chromium-style,
  also respected when packaged).
- `--skip-openclaw-auto-import` — skip the boot-time auto-import scan.
  `OPEN_CONTROLLER_SKIP_OPENCLAW_AUTO_IMPORT=1` does the same.

## Architecture

```
src/
├── main/
│   ├── agents/              ← spawn `openclaw` / `hermes`, parse their output
│   │   ├── openclaw-runner.ts   (extracts JSON envelope, execution trace)
│   │   └── hermes-runner.ts     (parses emoji-prefixed status stream)
│   ├── import/              ← read config shapes for detection + UI hints
│   ├── providers/router.ts  ← legacy direct-to-provider fallback (manual mode)
│   └── ipc/handlers.ts      ← `agent:run`, `agent:detect-binaries`, imports
├── preload/                 ← window.hermes.runAgent(...)
├── renderer/                ← React; ChatWindow renders AgentTurnResult trace
└── shared/                  ← types (AgentTurnResult, AgentAttempt, …)
```

## Testing

```bash
npm run typecheck
npm run build
npx playwright test                        # includes a live roundtrip
```

The Playwright suite includes `real-roundtrip.spec.ts`, which boots the
packaged Electron main, lets it auto-import the user's actual
`~/.openclaw`, sends a real message, spawns the real `openclaw agent`
binary, and asserts the execution-trace footer renders with
`provider: … · model: … · took: …s`. No mocks.

Example output from a passing run:

```
=== REAL openclaw agent REPLY ===
pong

=== TRACE FOOTER ===
openclaw agent · provider: ollama-cloud · model: deepseek-v3.2 · took: 10.4s · thinking: low
```
