import fs from 'fs'
import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

/**
 * Stress test: click through every sidebar view with a real OpenClaw import
 * and assert the app never white-screens (ErrorBoundary) or dies. This is
 * the regression net for "it keeps crashing".
 */

const projectRoot = process.cwd()

function resolveElectronBinary(): string {
  const electronDir = path.join(projectRoot, 'node_modules', 'electron')
  const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
  return path.join(electronDir, 'dist', rel)
}

const mainJs = path.join(projectRoot, 'out', 'main', 'index.js')

const VIEWS = ['Skills', 'Agents', 'Channels', 'Memory', 'Cron', 'Tasks', 'Flows', 'MCP', 'Logs', 'Health', 'Raw CLI', 'Chat']

test.setTimeout(240_000)

test('sidebar — every view renders without crashing', async () => {
  const userData = path.join(projectRoot, 'e2e', '.user-data-sidebar')
  fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(userData, { recursive: true })

  const app = await electron.launch({
    executablePath: resolveElectronBinary(),
    args: [mainJs, `--user-data-dir=${userData}`],
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: 60_000
  })

  const window = await app.firstWindow({ timeout: 45_000 })
  // Wait for chat or wizard
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(2000)

  // If wizard is showing, import the real OpenClaw fixture.
  const wizardHeading = window.getByRole('heading', { level: 1, name: /shortcut/ })
  if (await wizardHeading.isVisible().catch(() => false)) {
    const fixtureDir = path.join(projectRoot, 'test-fixtures', 'openclaw-real')
    await app.evaluate(async ({ dialog }, p) => {
      ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [p]
      })
    }, fixtureDir)
    await window.locator('button:has-text("Choose folder or file")').first().click()
  }

  // Chat should be visible now
  await expect(window.locator('h2:has-text("Hey")')).toBeVisible({ timeout: 15_000 })

  // Click every sidebar button and wait for the view to settle
  for (const label of VIEWS) {
    const btn = window.locator(`nav button:has-text("${label}")`)
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await btn.click()
    // ErrorBoundary text if things blew up
    const boundary = window.getByText('Something broke.', { exact: true })
    if (await boundary.isVisible().catch(() => false)) {
      const stack = await window.locator('pre').first().innerText().catch(() => '')
      throw new Error(`View "${label}" crashed into ErrorBoundary:\n${stack}`)
    }
    await window.waitForTimeout(400)
    console.log(`  ✓ ${label}`)
  }

  await app.close()
})
