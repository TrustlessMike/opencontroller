import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { HermesInstallDetection, OpenClawInstallDetection } from '../../shared/types'

const HERMES_YAML_NAMES = ['config.yaml', 'cli-config.yaml', 'hermes.yaml']
const OPENCLAW_JSON = 'openclaw.json'
const DOTENV = '.env'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Probe whether OpenClaw state exists at the default location (~/.openclaw).
 */
export async function detectOpenClawInstall(): Promise<OpenClawInstallDetection> {
  const rootPath = path.join(os.homedir(), '.openclaw')
  const dirOk = await pathExists(rootPath).then(async (ok) => {
    if (!ok) return false
    const st = await fs.stat(rootPath)
    return st.isDirectory()
  })

  if (!dirOk) {
    return {
      found: false,
      rootPath,
      hasJson: false,
      hasEnv: false,
      readable: false
    }
  }

  const jsonPath = path.join(rootPath, OPENCLAW_JSON)
  const envPath = path.join(rootPath, DOTENV)
  const [hasJson, hasEnv] = await Promise.all([pathExists(jsonPath), pathExists(envPath)])

  return {
    found: hasJson || hasEnv,
    rootPath,
    hasJson,
    hasEnv,
    readable: true
  }
}

/**
 * Probe whether Hermes Agent config exists at ~/.hermes.
 */
export async function detectHermesInstall(): Promise<HermesInstallDetection> {
  const rootPath = path.join(os.homedir(), '.hermes')
  const dirOk = await pathExists(rootPath).then(async (ok) => {
    if (!ok) return false
    const st = await fs.stat(rootPath)
    return st.isDirectory()
  })

  if (!dirOk) {
    return {
      found: false,
      rootPath,
      yamlPresent: [],
      hasEnv: false,
      readable: false
    }
  }

  const yamlPresent: string[] = []
  for (const name of HERMES_YAML_NAMES) {
    const p = path.join(rootPath, name)
    if (await pathExists(p)) yamlPresent.push(name)
  }
  const hasEnv = await pathExists(path.join(rootPath, DOTENV))
  const found = yamlPresent.length > 0 || hasEnv

  return {
    found,
    rootPath,
    yamlPresent,
    hasEnv,
    readable: true
  }
}

export async function detectAllAgentInstalls(): Promise<{
  openclaw: OpenClawInstallDetection
  hermes: HermesInstallDetection
}> {
  const [openclaw, hermes] = await Promise.all([
    detectOpenClawInstall(),
    detectHermesInstall()
  ])
  return { openclaw, hermes }
}
