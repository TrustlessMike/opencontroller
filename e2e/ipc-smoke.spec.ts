import fs from 'fs'
import path from 'path'
import { test, expect, _electron as electron } from '@playwright/test'

/**
 * Smoke test for every NEW IPC channel added in this sprint.
 *
 * Instead of driving the UI, we evaluate inside the renderer to hit each
 * `window.hermes.*` call directly. This proves the preload bridge is
 * correctly wired, the main-process handlers respond with the expected
 * shape, and nothing throws or crashes the renderer.
 *
 * We don't assert on full data content (sessions may be empty, approvals may
 * be unset) — we assert each call returns a well-formed response.
 */

function resolveElectronBinary(): string {
  const electronDir = path.join(process.cwd(), 'node_modules', 'electron')
  const rel = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim()
  return path.join(electronDir, 'dist', rel)
}

const mainJs = path.join(process.cwd(), 'out', 'main', 'index.js')

test('new IPC channels round-trip through preload without crashing', async () => {
  test.setTimeout(90_000)
  const userData = path.join(process.cwd(), 'e2e', '.user-data-ipc')
  fs.rmSync(userData, { recursive: true, force: true })
  fs.mkdirSync(userData, { recursive: true })

  const app = await electron.launch({
    executablePath: resolveElectronBinary(),
    args: [mainJs, `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: 60_000
  })

  try {
    const win = await app.firstWindow({ timeout: 45_000 })
    await win.waitForFunction(() => !!(window as any).hermes, { timeout: 15_000 })

    // Every new surface exposed on window.hermes by the preload.
    const presence = await win.evaluate(() => {
      const h = (window as any).hermes
      return {
        runAgentStream: typeof h.runAgentStream,
        showNotification: typeof h.showNotification,
        searchMemory: typeof h.searchMemory,
        listSessions: typeof h.listSessions,
        getApprovals: typeof h.getApprovals,
        onPushToTalk: typeof h.onPushToTalk
      }
    })
    for (const [name, t] of Object.entries(presence)) {
      expect(t, `${name} should be a function on window.hermes`).toBe('function')
    }

    // listSessions — either returns `{ ok: true, data: [] }` (sessions file
    // missing is fine) or `{ ok: false, error }`. Either way, shape is valid.
    const sessions = await win.evaluate(() => (window as any).hermes.listSessions())
    expect(sessions).toHaveProperty('ok')
    if (sessions.ok) expect(Array.isArray(sessions.data)).toBe(true)

    // getApprovals — same deal. When approvals aren't set, `exists` is false.
    const approvals = await win.evaluate(() => (window as any).hermes.getApprovals())
    expect(approvals).toHaveProperty('ok')
    if (approvals.ok) {
      expect(typeof approvals.data.exists).toBe('boolean')
      expect(typeof approvals.data.allowlistEntries).toBe('number')
    }

    // searchMemory — may fail if openclaw binary missing; we only assert the
    // IPC returns a shaped envelope.
    const mem = await win.evaluate(() =>
      (window as any).hermes.searchMemory('smoke test', 1)
    )
    expect(mem).toHaveProperty('ok')

    // showNotification — returns `{ ok }` envelope. Don't assert granted;
    // permission handler auto-grants via session.setPermissionRequestHandler.
    const notif = await win.evaluate(() =>
      (window as any).hermes.showNotification('Smoke test', 'IPC bridge alive')
    )
    expect(notif).toHaveProperty('ok')

    // onPushToTalk — returns an unsubscribe fn, must not throw.
    const unsubType = await win.evaluate(() => {
      const off = (window as any).hermes.onPushToTalk(() => {})
      const t = typeof off
      off()
      return t
    })
    expect(unsubType).toBe('function')
  } finally {
    await app.close()
  }
})
