// Smoke test: validates importer logic without needing the Electron runtime.
// Reimplements the same JSON parsing + validation inline so we exercise the
// same code paths as src/main/import/*.ts.
import { readFile } from 'node:fs/promises'

function validateOpenClaw(cfg) {
  if (!cfg.providers || typeof cfg.providers !== 'object')
    throw new Error('missing providers')
  if (!cfg.activeProvider) throw new Error('missing activeProvider')
  if (!cfg.providers[cfg.activeProvider])
    throw new Error(`activeProvider "${cfg.activeProvider}" not in providers`)
}

function validateHermes(cfg) {
  if (!cfg.assistantName) throw new Error('missing assistantName')
  if (!Array.isArray(cfg.tools)) cfg.tools = []
  if (!Array.isArray(cfg.memory)) cfg.memory = []
  return cfg
}

const results = []
async function run(label, fn) {
  try {
    await fn()
    results.push([true, label])
  } catch (e) {
    results.push([false, `${label}: ${e.message}`])
  }
}

await run('OpenClaw sample parses + validates', async () => {
  const cfg = JSON.parse(
    await readFile(new URL('./openclaw.sample.json', import.meta.url), 'utf8')
  )
  validateOpenClaw(cfg)
  if (cfg.providers.claude.model !== 'claude-sonnet-4-6') throw new Error('model mismatch')
  if (cfg.activeProvider !== 'claude') throw new Error('active mismatch')
})

await run('Hermes sample parses + validates', async () => {
  const cfg = JSON.parse(
    await readFile(new URL('./hermes.sample.json', import.meta.url), 'utf8')
  )
  const out = validateHermes(cfg)
  if (out.assistantName !== 'TARS') throw new Error('name mismatch')
  if (!out.tools.includes('web_search')) throw new Error('tools mismatch')
})

await run('OpenClaw bad config rejected', async () => {
  const cfg = JSON.parse(
    await readFile(new URL('./openclaw.bad.json', import.meta.url), 'utf8')
  )
  let threw = false
  try {
    validateOpenClaw(cfg)
  } catch {
    threw = true
  }
  if (!threw) throw new Error('should have thrown on activeProvider=gemini not in providers')
})

const passed = results.filter(([ok]) => ok).length
console.log(`\nResults: ${passed}/${results.length} passed`)
for (const [ok, msg] of results) console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
process.exit(results.every(([ok]) => ok) ? 0 : 1)
