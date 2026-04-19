import { useEffect, useState } from 'react'
import ChatWindow from './components/ChatWindow'
import ImportWizard from './components/ImportWizard'
import ProviderSelector from './components/ProviderSelector'
import SkillsPanel from './components/SkillsPanel'
import CliPanel from './components/CliPanel'
import RawCliPanel from './components/RawCliPanel'
import SessionsPanel from './components/SessionsPanel'
import SettingsPanel from './components/SettingsPanel'
import ApprovalsPanel from './components/ApprovalsPanel'
import Icon, { type IconName } from './components/Icon'
import type {
  OpenClawConfig,
  HermesConfig,
  ProviderId,
  OpenClawSkill,
  AgentTurnResult
} from '../../shared/types'

declare global {
  interface Window {
    hermes: import('../../preload').HermesAPI
  }
}

type View =
  | 'chat'
  | 'skills'
  | 'agents'
  | 'channels'
  | 'memory'
  | 'cron'
  | 'tasks'
  | 'flows'
  | 'mcp'
  | 'sessions'
  | 'approvals'
  | 'logs'
  | 'health'
  | 'raw'
  | 'settings'

// Each row is paired with a real SVG icon (see ./components/Icon.tsx) so the
// sidebar reads as a designed navigation, not a unicode-art menu.
const VIEWS: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'channels', label: 'Channels', icon: 'channels' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions' },
  { id: 'cron', label: 'Cron', icon: 'cron' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'flows', label: 'Flows', icon: 'flows' },
  { id: 'mcp', label: 'MCP', icon: 'mcp' },
  { id: 'approvals', label: 'Approvals', icon: 'approvals' },
  { id: 'logs', label: 'Logs', icon: 'logs' },
  { id: 'health', label: 'Health', icon: 'health' },
  { id: 'raw', label: 'Raw CLI', icon: 'raw' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
]

export default function App(): JSX.Element {
  const [openclaw, setOpenclaw] = useState<OpenClawConfig | undefined>()
  const [hermes, setHermes] = useState<HermesConfig | undefined>()
  const [activeProvider, setActiveProvider] = useState<ProviderId>('anthropic')
  const [bootReady, setBootReady] = useState(false)
  const [bootImportError, setBootImportError] = useState<string | null>(null)
  const [view, setView] = useState<View>('chat')
  const [approvalsCount, setApprovalsCount] = useState<number | null>(null)

  // Lightweight approvals-snapshot poll for the header badge. Not strictly
  // real-time; we refresh on boot + whenever the user opens the panel.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.hermes.getApprovals()
        if (!cancelled && res.ok) setApprovalsCount(res.data.allowlistEntries)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [existingOc, existingHermes, scan, allowAuto] = await Promise.all([
          window.hermes.getOpenClaw(),
          window.hermes.getHermes(),
          window.hermes.detectAgentInstalls(),
          window.hermes.isOpenClawAutoImportAllowed()
        ])
        if (cancelled) return

        let oc = existingOc
        let hm: HermesConfig | undefined = existingHermes
        const errors: string[] = []

        if (!oc && allowAuto && scan.openclaw.found) {
          const res = await window.hermes.importOpenClawDefault()
          if (!cancelled && res.success && res.config) oc = res.config
          else if (!res.success && res.error) errors.push(`OpenClaw: ${res.error}`)
        }

        if (!oc && allowAuto && scan.hermes.found) {
          const res = await window.hermes.importHermesDefault()
          if (!cancelled && res.success && res.hermes && res.providers) {
            hm = res.hermes
            oc = res.providers
          } else if (!res.success && res.error) {
            errors.push(`Hermes: ${res.error}`)
          }
        }

        if (!cancelled && oc) {
          setOpenclaw(oc)
          setActiveProvider(oc.activeProvider)
          setBootImportError(null)
        } else if (!cancelled) {
          setBootImportError(errors.length > 0 ? errors.join('\n\n') : null)
        }
        if (!cancelled) setHermes(hm)
      } finally {
        if (!cancelled) setBootReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onProviderChange = async (p: ProviderId): Promise<void> => {
    setActiveProvider(p)
    await window.hermes.setActiveProvider(p)
  }

  const onLogout = async (): Promise<void> => {
    await window.hermes.logout()
    setOpenclaw(undefined)
    setHermes(undefined)
    setActiveProvider('anthropic')
    setBootImportError(null)
    setView('chat')
  }

  const needsSetup = !openclaw
  const canLogout = Boolean(openclaw || hermes)
  const showSidebar = !needsSetup && openclaw?.source === 'openclaw'

  return (
    <div className="flex h-full flex-col glass rounded-xl overflow-hidden shadow-2xl shadow-black/40">
      <header className="drag-region flex items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-r from-white/[0.03] via-white/[0.015] to-white/[0.03] pl-[82px] pr-3 py-2">
        {/* pl-[82px] reserves space for the macOS traffic-light buttons so the
            title doesn't collide with them. */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative shrink-0">
            <div className="h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
          </div>
          <div className="min-w-0 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold tracking-tight text-white truncate">
              {hermes?.assistantName ?? 'opencontroller'}
            </span>
            <span className="text-[10.5px] text-white/35 truncate hidden sm:inline">
              {!bootReady
                ? 'reading local config…'
                : openclaw
                  ? openclaw.source === 'openclaw'
                    ? 'openclaw'
                    : openclaw.source === 'hermes'
                      ? 'hermes'
                      : 'manual'
                  : 'local'}
            </span>
          </div>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-1.5">
          {approvalsCount !== null && (
            <button
              type="button"
              onClick={() => setView('approvals')}
              title="Approvals — what the agent is allowed to do"
              className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10.5px] font-medium text-white/70 hover:bg-white/[0.07] hover:text-white"
            >
              <span
                className={
                  approvalsCount > 0 ? 'text-emerald-300' : 'text-amber-300'
                }
              >
                <Icon name="approvals" size={13} />
              </span>
              <span>{approvalsCount}</span>
            </button>
          )}
          {canLogout && (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/[0.07] hover:text-white"
            >
              Log out
            </button>
          )}
          <ProviderSelector
            providers={openclaw?.providers}
            active={activeProvider}
            onChange={onProviderChange}
          />
        </div>
      </header>

      <div className="main-shell flex min-h-0 min-w-0 flex-1">
        {showSidebar && (
          <nav className="no-drag flex w-[132px] shrink-0 flex-col gap-[1px] border-r border-white/[0.06] bg-black/20 px-1.5 py-2 text-[11px]">
            {VIEWS.map((v) => {
              const active = view === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition ${
                    active
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-teal-400" />
                  )}
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${
                      active ? 'text-teal-300' : 'text-white/45 group-hover:text-white/70'
                    }`}
                  >
                    <Icon name={v.icon} size={15} />
                  </span>
                  <span className="font-medium">{v.label}</span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!bootReady ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-teal-300/90" />
              <p className="text-sm text-white/45">Loading ~/.openclaw &amp; ~/.hermes…</p>
            </div>
          ) : needsSetup ? (
            <ImportWizard
              bootImportError={bootImportError}
              onOpenClawImported={(cfg) => {
                setOpenclaw(cfg)
                setActiveProvider(cfg.activeProvider)
                setBootImportError(null)
              }}
              onHermesImported={(hermesCfg, providers) => {
                setHermes(hermesCfg)
                setOpenclaw(providers)
                setActiveProvider(providers.activeProvider)
                setBootImportError(null)
              }}
            />
          ) : view === 'skills' && openclaw?.source === 'openclaw' ? (
            <SkillsPanel
              onRunSkill={async (
                skill: OpenClawSkill,
                intent: string
              ): Promise<AgentTurnResult | void> => {
                return await window.hermes.runAgent({
                  source: 'openclaw',
                  message: `${intent}\n\n(Use the \`${skill.name}\` skill.)`
                })
              }}
            />
          ) : view === 'agents' ? (
            <CliPanel title="Agents" args={['agents', 'list']} subtitle="Installed agents" />
          ) : view === 'channels' ? (
            <CliPanel
              title="Channels"
              args={['channels', 'status']}
              subtitle="Connected chat channels"
            />
          ) : view === 'memory' ? (
            <CliPanel
              title="Memory"
              args={['memory', 'index', '--dry-run']}
              subtitle="Memory index preview"
              autoRun={false}
            />
          ) : view === 'cron' ? (
            <CliPanel title="Cron" args={['cron', 'list']} subtitle="Scheduled jobs" />
          ) : view === 'tasks' ? (
            <CliPanel title="Tasks" args={['tasks', 'list']} subtitle="Queued tasks" />
          ) : view === 'flows' ? (
            <CliPanel title="Flows" args={['flows', 'list']} subtitle="Registered flows" />
          ) : view === 'mcp' ? (
            <CliPanel title="MCP" args={['mcp', 'list']} subtitle="MCP servers + bridge" />
          ) : view === 'sessions' ? (
            <SessionsPanel />
          ) : view === 'approvals' ? (
            <ApprovalsPanel />
          ) : view === 'settings' ? (
            <SettingsPanel />
          ) : view === 'logs' ? (
            <CliPanel title="Logs" args={['logs', '--tail', '200']} subtitle="Gateway logs" />
          ) : view === 'health' ? (
            <CliPanel title="Health" args={['health']} subtitle="Gateway + channels" />
          ) : view === 'raw' ? (
            <RawCliPanel />
          ) : (
            <ChatWindow
              provider={activeProvider}
              assistantName={hermes?.assistantName ?? 'opencontroller'}
              importSource={openclaw?.source}
            />
          )}
        </div>
      </div>
    </div>
  )
}
