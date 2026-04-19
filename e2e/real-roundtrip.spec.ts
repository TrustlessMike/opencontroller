import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

/**
 * REAL end-to-end roundtrip. No mocks.
 *
 * Boots Electron, auto-imports the user's actual ~/.openclaw install, then
 * sends a chat message that the app dispatches through the REAL
 * `openclaw agent --local --agent main --message … --json` binary. Asserts:
 *
 *   1. a non-empty non-error reply is rendered
 *   2. the execution-trace footer ("openclaw agent · provider: … · model: …")
 *      is rendered — proving the spawn-based path ran, not legacy HTTP.
 *
 * Skips cleanly if ~/.openclaw or `openclaw` binary is not present.
 */

const projectRoot = process.cwd()

function resolveElectronBinary(): string {
  const electronDir = path.join(projectRoot, 'node_modules', 'electron')
  const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
  return path.join(electronDir, 'dist', rel)
}

const mainJs = path.join(projectRoot, 'out', 'main', 'index.js')
const openclawJson = path.join(os.homedir(), '.openclaw', 'openclaw.json')

test.describe('Real openclaw agent roundtrip', () => {
  test.skip(
    !fs.existsSync(openclawJson),
    `~/.openclaw/openclaw.json not present — skipping real-agent roundtrip`
  )

  test('spawns the real `openclaw agent` binary and renders its execution trace', async () => {
    test.setTimeout(240_000)

    const userData = path.join(projectRoot, 'e2e', '.user-data-real')
    fs.rmSync(userData, { recursive: true, force: true })
    fs.mkdirSync(userData, { recursive: true })

    const app = await electron.launch({
      executablePath: resolveElectronBinary(),
      args: [mainJs, `--user-data-dir=${userData}`],
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 60_000
    })

    try {
      const window = await app.firstWindow({ timeout: 45_000 })
      await expect(window).toHaveTitle(/opencontroller/)

      await expect(window.locator('h2:has-text("Hey")')).toBeVisible({ timeout: 30_000 })
      await expect(window.getByText(/Imported from OpenClaw/)).toBeVisible()

      const input = window.locator('input[placeholder^="Message"]')
      await expect(input).toBeVisible({ timeout: 10_000 })
      await input.fill('Reply with just one word: pong')

      await window.locator('button:has-text("Send")').click()

      await expect(
        window.locator('div.whitespace-pre-wrap', {
          hasText: 'Reply with just one word: pong'
        })
      ).toBeVisible({ timeout: 5_000 })

      // Real openclaw turn — workspace bootstrap + model inference. Up to 3m.
      const assistantBubble = window.locator('div.whitespace-pre-wrap').nth(1)
      await expect(assistantBubble).toBeVisible({ timeout: 180_000 })
      await expect(window.locator('.chat-dot').first()).toBeHidden({ timeout: 180_000 })

      const replyText = (await assistantBubble.textContent())?.trim() ?? ''
      // eslint-disable-next-line no-console
      console.log('\n=== REAL openclaw agent REPLY ===\n' + replyText + '\n')

      expect(replyText.length, 'reply non-empty').toBeGreaterThan(0)
      expect(
        replyText.toLowerCase().startsWith('error:'),
        `agent returned error bubble: ${replyText}`
      ).toBe(false)

      // The real-agent path renders the execution trace footer.
      await expect(window.locator('text=openclaw agent').first()).toBeVisible({ timeout: 5_000 })
      const footerText =
        (await window.locator('text=openclaw agent').first().locator('..').textContent()) ?? ''
      // eslint-disable-next-line no-console
      console.log('=== TRACE FOOTER ===\n' + footerText + '\n')
      expect(footerText).toMatch(/provider:|model:|took:/)
    } finally {
      await app.close()
    }
  })
})
