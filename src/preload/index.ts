import { contextBridge, ipcRenderer } from 'electron'
import type {
  SendMessagePayload,
  OpenClawConfig,
  HermesConfig,
  ProviderId,
  AgentInstallScan,
  AgentRunPayload,
  AgentTurnResult,
  AgentBinaryStatus,
  OpenClawSkillsList,
  OpenClawCommandResult,
  IpcResult,
  AgentStreamEvent,
  MemorySearchResult,
  SessionSummary,
  ApprovalsSnapshot
} from '../shared/types'

type ImportResult<T> = { success: true; config?: T } | { success: false; error?: string }
type HermesImportResult =
  | { success: true; hermes: HermesConfig; providers: OpenClawConfig }
  | { success: false; error?: string }

const api = {
  importOpenClaw: (): Promise<ImportResult<OpenClawConfig>> =>
    ipcRenderer.invoke('import:openclaw'),

  importOpenClawDefault: (): Promise<ImportResult<OpenClawConfig>> =>
    ipcRenderer.invoke('import:openclaw-default'),

  importHermes: (): Promise<HermesImportResult> => ipcRenderer.invoke('import:hermes'),

  importHermesDefault: (): Promise<HermesImportResult> =>
    ipcRenderer.invoke('import:hermes-default'),

  detectAgentInstalls: (): Promise<AgentInstallScan> =>
    ipcRenderer.invoke('import:detect-agents'),

  getOpenClaw: (): Promise<OpenClawConfig | undefined> =>
    ipcRenderer.invoke('config:get-openclaw'),

  getHermes: (): Promise<HermesConfig | undefined> => ipcRenderer.invoke('config:get-hermes'),

  /** When false, skip auto-import (e.g. Playwright / isolated runs). */
  isOpenClawAutoImportAllowed: (): Promise<boolean> =>
    ipcRenderer.invoke('config:openclaw-auto-import-allowed'),

  setActiveProvider: (provider: ProviderId): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('config:set-active-provider', provider),

  logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('config:logout'),

  sendMessage: (
    payload: SendMessagePayload
  ): Promise<{ content: string; provider: ProviderId }> =>
    ipcRenderer.invoke('ai:send', payload),

  /** Drive the real openclaw / hermes CLI and get a structured turn back. */
  runAgent: (payload: AgentRunPayload): Promise<AgentTurnResult> =>
    ipcRenderer.invoke('agent:run', payload),

  detectAgentBinaries: (): Promise<AgentBinaryStatus> =>
    ipcRenderer.invoke('agent:detect-binaries'),

  listOpenClawSkills: (): Promise<IpcResult<OpenClawSkillsList>> =>
    ipcRenderer.invoke('openclaw:skills-list'),

  getOpenClawSkillInfo: (name: string): Promise<IpcResult<{ raw: string }>> =>
    ipcRenderer.invoke('openclaw:skills-info', name),

  /** Run ANY openclaw subcommand (`openclaw agents list --json`, etc.). */
  runOpenClawCommand: (args: string[]): Promise<IpcResult<OpenClawCommandResult>> =>
    ipcRenderer.invoke('openclaw:run-command', args),

  /** Streaming agent run — fires onEvent for each progress line, resolves
   *  with the final structured result once done. */
  runAgentStream: (
    payload: AgentRunPayload,
    onEvent: (e: AgentStreamEvent) => void
  ): Promise<{ id: string; result: AgentTurnResult }> => {
    const handler = (_: unknown, ev: AgentStreamEvent): void => {
      try {
        onEvent(ev)
      } catch {
        /* ignore */
      }
    }
    ipcRenderer.on('agent:event', handler)
    const p = ipcRenderer.invoke('agent:run-stream', payload) as Promise<{
      id: string
      result: AgentTurnResult
    }>
    return p.finally(() => ipcRenderer.removeListener('agent:event', handler))
  },

  /** Show a native desktop notification (click brings app forward). */
  showNotification: (title: string, body: string): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('notify:show', { title, body }),

  /** Search the user's OpenClaw memory corpus for grounding context. */
  searchMemory: (query: string, limit = 5): Promise<IpcResult<MemorySearchResult>> =>
    ipcRenderer.invoke('memory:search', query, limit),

  /** List recent OpenClaw sessions (history + token/cost summary). */
  listSessions: (): Promise<IpcResult<SessionSummary[]>> => ipcRenderer.invoke('sessions:list'),

  /** Read approvals snapshot (defaults + allowlist count). */
  getApprovals: (): Promise<IpcResult<ApprovalsSnapshot>> => ipcRenderer.invoke('approvals:get'),

  /** Subscribe to push-to-talk toggle events from the main-process global
   *  shortcut. Returns an unsubscribe fn. */
  onPushToTalk: (cb: () => void): (() => void) => {
    const h = (): void => cb()
    ipcRenderer.on('ptt:toggle', h)
    return () => ipcRenderer.removeListener('ptt:toggle', h)
  }
}

contextBridge.exposeInMainWorld('hermes', api)

export type HermesAPI = typeof api
