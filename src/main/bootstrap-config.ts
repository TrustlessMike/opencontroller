import { detectOpenClawInstall, detectHermesInstall } from './import/discover'
import { importOpenClawFromDefaultLocation } from './import/openclaw-importer'
import { importHermesFromDefaultLocation } from './import/hermes-importer'
import { mainStore } from './store-instance'
import { skipOpenClawAutoImportFromDisk } from './skip-auto-import'
import type { OpenClawConfig } from '../shared/types'

/**
 * If the app has no saved routing config yet, load from the same paths OpenClaw / Hermes
 * use on disk (~/.openclaw, ~/.hermes) so an existing install works without the wizard.
 */
export async function bootstrapConfigFromDiskIfNeeded(): Promise<void> {
  if (skipOpenClawAutoImportFromDisk()) return

  const existing = mainStore.get('openclaw') as OpenClawConfig | undefined
  if (existing?.providers && Object.keys(existing.providers).length > 0) {
    return
  }

  const oc = await detectOpenClawInstall()
  if (oc.found) {
    try {
      await importOpenClawFromDefaultLocation()
      return
    } catch (e) {
      console.warn('[bootstrap] OpenClaw auto-import failed:', (e as Error).message)
    }
  }

  const hm = await detectHermesInstall()
  if (hm.found) {
    try {
      await importHermesFromDefaultLocation()
    } catch (e) {
      console.warn('[bootstrap] Hermes auto-import failed:', (e as Error).message)
    }
  }
}
