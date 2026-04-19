import { app } from 'electron'
import path from 'path'

function resolveUserDataPath(dir: string): string {
  const trimmed = dir.trim()
  if (!trimmed) return trimmed
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(process.cwd(), trimmed)
}

/**
 * Must run before any `new Store()` (or other code that reads `app.getPath('userData')`).
 * Supports `--user-data-dir=/path` or `--user-data-dir` `/path` (Chromium-style).
 */
function applyUserDataDirFromArgv(): void {
  const eqArg = process.argv.find((a) => a.startsWith('--user-data-dir='))
  if (eqArg) {
    const dir = eqArg.slice('--user-data-dir='.length).trim()
    if (dir) app.setPath('userData', resolveUserDataPath(dir))
    return
  }
  const idx = process.argv.indexOf('--user-data-dir')
  if (idx !== -1) {
    const dir = process.argv[idx + 1]?.trim()
    if (dir && !dir.startsWith('-')) app.setPath('userData', resolveUserDataPath(dir))
  }
}

applyUserDataDirFromArgv()
