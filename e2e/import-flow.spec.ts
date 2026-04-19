import fs from 'fs'
import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

const projectRoot = process.cwd()

function resolveElectronBinary(): string {
  const electronDir = path.join(projectRoot, 'node_modules', 'electron')
  const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
  return path.join(electronDir, 'dist', rel)
}

const mainJs = path.join(projectRoot, 'out', 'main', 'index.js')

test.describe('Import flow', () => {
  test('patching the file dialog imports an OpenClaw fixture and reveals the chat', async () => {
    const userData = path.join(projectRoot, 'e2e', '.user-data-import')
    fs.rmSync(userData, { recursive: true, force: true })
    fs.mkdirSync(userData, { recursive: true })

    const fixtureDir = path.join(projectRoot, 'test-fixtures', 'openclaw-real')

    const app = await electron.launch({
      executablePath: resolveElectronBinary(),
      args: [mainJs, `--user-data-dir=${userData}`, '--skip-openclaw-auto-import'],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        OPEN_CONTROLLER_SKIP_OPENCLAW_AUTO_IMPORT: '1'
      },
      timeout: 60_000
    })

    try {
      // Patch dialog.showOpenDialog in the main process to auto-return our fixture
      await app.evaluate(async ({ dialog }, p) => {
        const original = dialog.showOpenDialog
        ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
          canceled: false,
          filePaths: [p]
        })
        // Keep a ref so it's not tree-shaken
        ;(dialog as unknown as { __original: typeof original }).__original = original
      }, fixtureDir)

      const window = await app.firstWindow({ timeout: 45_000 })
      await expect(window).toHaveTitle(/opencontroller/)

      // Click the OpenClaw Browse… button
      // First "Choose folder or file…" button belongs to the OpenClaw card
      const browseBtn = window.locator('button:has-text("Choose folder or file")').first()
      await expect(browseBtn).toBeVisible({ timeout: 15_000 })
      await browseBtn.click()

      // After import succeeds, ImportWizard unmounts and ChatWindow mounts.
      // The chat empty-state shows an assistant greeting.
      const assistantHeading = window.locator('h2:has-text("Hey")')
      await expect(assistantHeading).toBeVisible({ timeout: 15_000 })

      // Verify source badge
      await expect(window.getByText(/Imported from OpenClaw/)).toBeVisible()

      // Log out and confirm we're back at the wizard
      await window.locator('button:has-text("Log out")').click()
      await expect(window.getByRole('heading', { level: 1 })).toHaveText(
        'Your stack, one shortcut away'
      )
    } finally {
      await app.close()
    }
  })

  test('patching the file dialog imports a Hermes Agent fixture and reveals the chat', async () => {
    const userData = path.join(projectRoot, 'e2e', '.user-data-hermes')
    fs.rmSync(userData, { recursive: true, force: true })
    fs.mkdirSync(userData, { recursive: true })

    const fixtureDir = path.join(projectRoot, 'test-fixtures', 'hermes-real')

    const app = await electron.launch({
      executablePath: resolveElectronBinary(),
      args: [mainJs, `--user-data-dir=${userData}`, '--skip-openclaw-auto-import'],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        OPEN_CONTROLLER_SKIP_OPENCLAW_AUTO_IMPORT: '1'
      },
      timeout: 60_000
    })

    try {
      await app.evaluate(async ({ dialog }, p) => {
        ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
          canceled: false,
          filePaths: [p]
        })
      }, fixtureDir)

      const window = await app.firstWindow({ timeout: 45_000 })

      // Second "Choose folder or file…" is on the Hermes card
      const hermesBrowseBtn = window.locator('button:has-text("Choose folder or file")').nth(1)
      await expect(hermesBrowseBtn).toBeVisible({ timeout: 15_000 })
      await hermesBrowseBtn.click()

      // Chat appears with the imported assistant name "TARS"
      await expect(window.locator('h2:has-text("TARS")')).toBeVisible({ timeout: 15_000 })
      await expect(window.getByText(/Imported from Hermes Agent/)).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
