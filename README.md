<div align="center">

# OpenController

**GUI Shell for AI Agent CLIs**

[![Electron](https://img.shields.io/badge/Electron-35-blue)](https://electronjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](https://opensource.org/licenses/MIT)

</div>

An Electron GUI shell for locally-installed agent binaries. It doesn't re-implement provider routing. It **drives the real `openclaw` and `hermes` CLIs you already have** and gives you better visual feedback about what the agent just did.

## Why OpenController?

Terminal output from AI agents is a firehose. OpenController turns that into a legible transcript:

- **Provider tracking** — Which provider won, which model it picked
- **Timing analytics** — How long each turn took
- **Tool call visualization** — Which tools were called, with what args
- **Fallback chains** — See when and why models fell back
- **Keyboard summonable** — Summon and dismiss with a hotkey

## Quick Start

```bash
# Install
npm install -g opencontroller

# Launch
opencontroller
```

Or download the latest release from the [Releases](https://github.com/TrustlessMike/opencontroller/releases) page.

## Architecture

OpenController connects to your existing agent CLIs via their stdio streams. It reads structured output, parses tool calls, and renders them in a rich UI. No API keys required beyond what you already have configured.

## License

MIT
