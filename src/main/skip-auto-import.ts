/** Skip loading ~/.openclaw / ~/.hermes at startup (Playwright, CI, debugging). */
export function skipOpenClawAutoImportFromDisk(): boolean {
  if (process.env['OPEN_CONTROLLER_SKIP_OPENCLAW_AUTO_IMPORT'] === '1') return true
  if (process.argv.includes('--skip-openclaw-auto-import')) return true
  return false
}
