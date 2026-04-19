import fs from 'fs'
import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

/** Playwright runs tests with cwd = repo root (`npm run test:e2e` / `playwright test`). */
const projectRoot = process.cwd()
const e2eUserData = path.join(projectRoot, 'e2e', '.user-data')

function resolveElectronBinary(): string {
  const electronDir = path.join(projectRoot, 'node_modules', 'electron')
  const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
  return path.join(electronDir, 'dist', rel)
}
const mainJs = path.join(projectRoot, 'out', 'main', 'index.js')

test.describe('opencontroller', () => {
  test('launches setup screen with opencontroller branding', async () => {
    fs.mkdirSync(e2eUserData, { recursive: true })
    const app = await electron.launch({
      executablePath: resolveElectronBinary(),
      args: [mainJs, `--user-data-dir=${e2eUserData}`, '--skip-openclaw-auto-import'],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        OPEN_CONTROLLER_SKIP_OPENCLAW_AUTO_IMPORT: '1'
      },
      timeout: 60_000
    })

    try {
      const window = await app.firstWindow({ timeout: 45_000 })
      await expect(window).toHaveTitle(/opencontroller/)

      await expect(window.getByRole('heading', { level: 1 })).toHaveText(
        'Your stack, one shortcut away'
      )

      await expect(
        window.getByText(/API keys never leave this machine/)
      ).toBeVisible()
      await expect(window.getByRole('heading', { name: 'OpenClaw' })).toBeVisible()
      await expect(window.getByRole('heading', { name: 'Hermes Agent' })).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
