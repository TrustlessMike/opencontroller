import { ipcMain, dialog, BrowserWindow, Notification } from 'electron'
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import {
  importOpenClawConfig,
  importOpenClawFromDefaultLocation
} from '../import/openclaw-importer'
import {
  importHermesConfig,
  importHermesFromDefaultLocation
} from '../import/hermes-importer'
import { detectAllAgentInstalls } from '../import/discover'
import { routeToProvider } from '../providers/router'
import { mainStore } from '../store-instance'
import { skipOpenClawAutoImportFromDisk } from '../skip-auto-import'
import { runOpenClawTurn, detectOpenClawBinary } from '../agents/openclaw-runner'
import { runHermesTurn, detectHermesBinary } from '../agents/hermes-runner'
import {
  listOpenClawSkills,
  checkOpenClawSkills,
  getOpenClawSkillInfo,
  runOpenClawCommand
} from '../agents/openclaw-skills'
import type {
  SendMessagePayload,
  OpenClawConfig,
  HermesConfig,
  AgentRunPayload,
  AgentTurnResult,
  AgentStreamEvent,
  MemorySearchResult,
  SessionSummary,
  ApprovalsSnapshot
} from '../../shared/types'

export function registerIPCHandlers(): void {
  // ── OpenClaw import ──────────────────────────────────────────────
  ipcMain.handle('import:openclaw', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import OpenClaw — pick ~/.openclaw folder, openclaw.json, or .env',
      filters: [{ name: 'OpenClaw config', extensions: ['json', 'env'] }],
      properties: ['openFile', 'openDirectory']
    })
    if (canceled || !filePaths[0]) return { success: false }
    try {
      const config = await importOpenClawConfig(filePaths[0])
      return { success: true, config }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('import:openclaw-default', async () => {
    try {
      const config = await importOpenClawFromDefaultLocation()
      return { success: true, config }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  // ── Hermes Agent import ──────────────────────────────────────────
  ipcMain.handle('import:hermes', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import Hermes Agent — pick ~/.hermes folder, config.yaml, or .env',
      filters: [{ name: 'Hermes config', extensions: ['yaml', 'yml', 'env'] }],
      properties: ['openFile', 'openDirectory']
    })
    if (canceled || !filePaths[0]) return { success: false }
    try {
      const result = await importHermesConfig(filePaths[0])
      return { success: true, ...result }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('import:hermes-default', async () => {
    try {
      const result = await importHermesFromDefaultLocation()
      return { success: true, ...result }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('import:detect-agents', async () => detectAllAgentInstalls())

  // ── Config access ────────────────────────────────────────────────
  ipcMain.handle('config:get-openclaw', () => mainStore.get('openclaw') as OpenClawConfig | undefined)
  ipcMain.handle('config:get-hermes', () => mainStore.get('hermes') as HermesConfig | undefined)

  ipcMain.handle('config:openclaw-auto-import-allowed', () => {
    return !skipOpenClawAutoImportFromDisk()
  })

  ipcMain.handle('config:set-active-provider', (_e, provider: string) => {
    const existing = (mainStore.get('openclaw') as OpenClawConfig) ?? {
      providers: {},
      activeProvider: 'anthropic'
    }
    existing.activeProvider = provider as OpenClawConfig['activeProvider']
    mainStore.set('openclaw', existing)
    return { success: true }
  })

  ipcMain.handle('config:logout', () => {
    mainStore.delete('openclaw')
    mainStore.delete('hermes')
    return { success: true }
  })

  // ── AI send (legacy direct-to-provider; still used by older chat flow) ──
  ipcMain.handle('ai:send', async (_e, payload: SendMessagePayload) => {
    const openclaw = mainStore.get('openclaw') as OpenClawConfig | undefined
    if (!openclaw) throw new Error('No config imported yet')
    const providerConfig = openclaw.providers[payload.provider]
    if (!providerConfig) throw new Error(`Provider ${payload.provider} not configured`)
    return await routeToProvider(payload.provider, providerConfig, payload)
  })

  // ── REAL agent runs (shell out to actual openclaw / hermes binaries) ────
  // This is the core of opencontroller: we don't reimplement provider
  // routing, we drive the user's installed agents and surface what they did.
  ipcMain.handle('agent:run', async (_e, payload: AgentRunPayload): Promise<AgentTurnResult> => {
    if (payload.source === 'openclaw') {
      const res = await runOpenClawTurn(payload.message, {
        agent: payload.openclaw?.agent,
        thinking: payload.openclaw?.thinking as
          | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
          | undefined
      })
      return {
        source: 'openclaw',
        text: res.text,
        durationMs: res.durationMs,
        livenessState: res.livenessState,
        stopReason: res.stopReason,
        winnerProvider: res.winnerProvider,
        winnerModel: res.winnerModel,
        attempts: res.attempts,
        fallbackUsed: res.fallbackUsed,
        runner: res.runner,
        toolsUsed: res.toolsUsed,
        toolCalls: res.toolCalls,
        toolFailures: res.toolFailures,
        thinking: res.thinking
      }
    }
    if (payload.source === 'hermes') {
      const res = await runHermesTurn(payload.message, {
        provider: payload.hermes?.provider,
        model: payload.hermes?.model,
        maxTurns: payload.hermes?.maxTurns
      })
      return {
        source: 'hermes',
        text: res.text,
        events: res.events,
        error: res.error
      }
    }
    throw new Error(`Unknown agent source: ${(payload as { source: string }).source}`)
  })

  ipcMain.handle('agent:detect-binaries', async () => ({
    openclaw: await detectOpenClawBinary(),
    hermes: await detectHermesBinary()
  }))

  // ── OpenClaw skills / capabilities ──────────────────────────────
  ipcMain.handle('openclaw:skills-list', async () => {
    try {
      return { ok: true, data: await listOpenClawSkills() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('openclaw:skills-check', async () => {
    try {
      return { ok: true, data: await checkOpenClawSkills() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('openclaw:skills-info', async (_e, name: string) => {
    try {
      return { ok: true, data: await getOpenClawSkillInfo(name) }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Generic openclaw command runner — backs every CLI-to-GUI panel.
  ipcMain.handle('openclaw:run-command', async (_e, args: string[]) => {
    try {
      return { ok: true, data: await runOpenClawCommand(args, { timeoutMs: 5 * 60_000 }) }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // ── Streaming agent runs (live stderr → renderer events) ────────────────
  // Same output shape as `agent:run`, but emits `agent:event` channel messages
  // as the run progresses so the UI can show "thinking"/tool-use live.
  ipcMain.handle(
    'agent:run-stream',
    async (e, payload: AgentRunPayload): Promise<{ id: string; result: AgentTurnResult }> => {
      const id = randomUUID()
      const wc = e.sender
      const emit = (ev: Omit<AgentStreamEvent, 'id'>): void => {
        if (wc.isDestroyed()) return
        wc.send('agent:event', { id, ...ev })
      }
      emit({ kind: 'start' })
      try {
        let result: AgentTurnResult
        if (payload.source === 'openclaw') {
          const res = await runOpenClawTurn(payload.message, {
            agent: payload.openclaw?.agent,
            thinking: payload.openclaw?.thinking as
              | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
              | undefined,
            onEvent: (ev) => emit({ kind: 'line', level: ev.level, text: ev.text })
          })
          result = {
            source: 'openclaw',
            text: res.text,
            durationMs: res.durationMs,
            livenessState: res.livenessState,
            stopReason: res.stopReason,
            winnerProvider: res.winnerProvider,
            winnerModel: res.winnerModel,
            attempts: res.attempts,
            fallbackUsed: res.fallbackUsed,
            runner: res.runner,
            toolsUsed: res.toolsUsed,
            toolCalls: res.toolCalls,
            toolFailures: res.toolFailures,
            thinking: res.thinking
          }
        } else if (payload.source === 'hermes') {
          const res = await runHermesTurn(payload.message, {
            provider: payload.hermes?.provider,
            model: payload.hermes?.model,
            maxTurns: payload.hermes?.maxTurns
          })
          res.events?.forEach((ev) => emit({ kind: 'line', level: ev.level, text: ev.text }))
          result = { source: 'hermes', text: res.text, events: res.events, error: res.error }
        } else {
          throw new Error(`Unknown agent source: ${(payload as { source: string }).source}`)
        }
        emit({ kind: 'done', result })
        return { id, result }
      } catch (err) {
        const msg = (err as Error).message
        emit({ kind: 'error', text: msg })
        throw err
      }
    }
  )

  // ── Desktop notifications ───────────────────────────────────────────────
  ipcMain.handle('notify:show', (_e, { title, body }: { title: string; body: string }) => {
    if (!Notification.isSupported()) return { ok: false, error: 'notifications unsupported' }
    try {
      const n = new Notification({ title, body, silent: false })
      n.on('click', () => {
        const w = BrowserWindow.getAllWindows()[0]
        if (w) {
          if (!w.isVisible()) w.show()
          w.focus()
        }
      })
      n.show()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // ── Memory search (grounding) ───────────────────────────────────────────
  ipcMain.handle(
    'memory:search',
    async (_e, query: string, limit = 5): Promise<{ ok: true; data: MemorySearchResult } | { ok: false; error: string }> => {
      try {
        const res = await runOpenClawCommand(
          ['memory', 'search', query, '--json', '--limit', String(limit)],
          { timeoutMs: 30_000 }
        )
        if (res.exitCode !== 0) return { ok: false, error: res.stderr || `exit ${res.exitCode}` }
        let hits: MemorySearchResult['hits'] = []
        try {
          const parsed = JSON.parse(res.stdout) as unknown
          if (Array.isArray(parsed)) {
            hits = parsed as MemorySearchResult['hits']
          } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { hits?: unknown }).hits)) {
            hits = (parsed as { hits: MemorySearchResult['hits'] }).hits
          }
        } catch {
          // Non-JSON stdout — treat as a single free-text hit.
          if (res.stdout.trim()) hits = [{ score: 0, text: res.stdout.trim() }]
        }
        return { ok: true, data: { query, hits: hits.slice(0, limit) } }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  // ── Sessions (history) ──────────────────────────────────────────────────
  ipcMain.handle(
    'sessions:list',
    async (): Promise<{ ok: true; data: SessionSummary[] } | { ok: false; error: string }> => {
      const path = join(homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json')
      try {
        const raw = await readFile(path, 'utf8')
        const parsed = JSON.parse(raw) as unknown
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { sessions?: unknown[] })?.sessions)
            ? (parsed as { sessions: unknown[] }).sessions
            : []
        const out: SessionSummary[] = arr
          .map((s): SessionSummary | null => {
            if (!s || typeof s !== 'object') return null
            const o = s as Record<string, unknown>
            const id = String(o.id ?? o.sessionId ?? o.uuid ?? '')
            if (!id) return null
            return {
              id,
              label: typeof o.label === 'string' ? o.label : (o.title as string | undefined),
              model: o.model as string | undefined,
              modelProvider: o.modelProvider as string | undefined,
              inputTokens: typeof o.inputTokens === 'number' ? o.inputTokens : undefined,
              outputTokens: typeof o.outputTokens === 'number' ? o.outputTokens : undefined,
              estimatedCostUsd:
                typeof o.estimatedCostUsd === 'number' ? o.estimatedCostUsd : undefined,
              lastActivity:
                typeof o.lastActivity === 'number'
                  ? o.lastActivity
                  : typeof o.updatedAt === 'string'
                    ? Date.parse(o.updatedAt) || undefined
                    : undefined
            }
          })
          .filter((x): x is SessionSummary => x !== null)
          .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
        return { ok: true, data: out }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  // ── Approvals snapshot ──────────────────────────────────────────────────
  ipcMain.handle(
    'approvals:get',
    async (): Promise<{ ok: true; data: ApprovalsSnapshot } | { ok: false; error: string }> => {
      try {
        const res = await runOpenClawCommand(['approvals', 'get'], { timeoutMs: 15_000 })
        const raw = (res.stdout || '') + (res.stderr || '')
        const exists = res.exitCode === 0 && raw.trim().length > 0
        // Count allowlist entries heuristically — lines starting with "- " or
        // "*" inside an "allowlist" block.
        let inAllow = false
        let allowlistEntries = 0
        let defaults: string | undefined
        for (const line of raw.split(/\r?\n/)) {
          if (/^\s*allowlist\s*:/i.test(line)) inAllow = true
          else if (/^\S/.test(line) && inAllow) inAllow = false
          else if (inAllow && /^\s*[-*]\s+/.test(line)) allowlistEntries++
          const m = line.match(/^\s*default[s]?\s*:\s*(.+)$/i)
          if (m) defaults = m[1].trim()
        }
        return {
          ok: true,
          data: { exists, defaults, allowlistEntries, raw: raw.slice(0, 8000) }
        }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )
}
