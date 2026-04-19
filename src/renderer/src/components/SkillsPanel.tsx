import { useEffect, useMemo, useState } from 'react'
import type { OpenClawSkill, OpenClawSkillsList, AgentTurnResult } from '../../../shared/types'
import Icon from './Icon'

interface Props {
  /** Called when the user picks a skill to run in the chat — parent sends an
   *  agent turn through the normal runAgent path and renders the result. */
  onRunSkill: (skill: OpenClawSkill, intent: string) => Promise<AgentTurnResult | void>
}

type Filter = 'all' | 'eligible' | 'missing'

export default function SkillsPanel({ onRunSkill }: Props): JSX.Element {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'ready'; data: OpenClawSkillsList }
  >({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<OpenClawSkill | null>(null)
  const [detailInfo, setDetailInfo] = useState<string>('')
  const [intent, setIntent] = useState('')
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.hermes.listOpenClawSkills()
        if (cancelled) return
        if (res.ok) setState({ status: 'ready', data: res.data })
        else setState({ status: 'error', error: res.error })
      } catch (e) {
        if (cancelled) return
        setState({ status: 'error', error: (e as Error).message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) {
      setDetailInfo('')
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await window.hermes.getOpenClawSkillInfo(selected.name)
        if (cancelled) return
        if (res.ok) setDetailInfo(res.data.raw)
        else setDetailInfo(`Error loading skill info: ${res.error}`)
      } catch (e) {
        if (cancelled) return
        setDetailInfo(`Error loading skill info: ${(e as Error).message}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  const skills = state.status === 'ready' ? state.data.skills : []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((s) => {
      if (filter === 'eligible' && !s.eligible) return false
      if (filter === 'missing' && s.eligible) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [skills, query, filter])

  const runSelected = async (): Promise<void> => {
    if (!selected || running) return
    const text = intent.trim() || `Use the ${selected.name} skill.`
    setRunning(true)
    setLastRun('')
    try {
      const result = await onRunSkill(selected, text)
      if (result && 'text' in result) {
        setLastRun(result.text || '(no text)')
      } else {
        setLastRun('(sent to chat)')
      }
    } catch (e) {
      setLastRun(`Error: ${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Loading skills from <code className="mx-1">openclaw skills list</code>…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-rose-300">
        <div className="font-semibold">Couldn’t list skills</div>
        <pre className="max-w-lg whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-left text-xs text-white/70">
          {state.error}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="no-drag shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${skills.length} skills…`}
            className="min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-teal-400/35"
          />
          {(['all', 'eligible', 'missing'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium capitalize transition ${
                filter === f
                  ? 'bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40'
                  : 'bg-white/[0.04] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filtered.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelected(s)}
                className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
                  selected?.name === s.name
                    ? 'border-teal-400/40 bg-white/[0.08]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${
                      s.eligible
                        ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20'
                        : 'bg-white/[0.04] text-white/50 ring-white/[0.08]'
                    }`}
                  >
                    <Icon name="skills" size={13} />
                  </span>
                  <span className="truncate text-sm font-semibold text-white">{s.name}</span>
                  <span
                    className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      s.eligible
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {s.eligible ? 'ready' : 'missing'}
                  </span>
                </div>
                <div className="line-clamp-2 text-[11px] leading-snug text-white/55">
                  {s.description || '—'}
                </div>
                {!s.eligible && s.missing.bins.length > 0 && (
                  <div className="text-[10px] text-amber-300/80">
                    needs: {s.missing.bins.join(', ')}
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full py-8 text-center text-xs text-white/40">
                No skills match.
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div className="hidden w-[360px] shrink-0 flex-col border-l border-white/[0.06] bg-black/20 lg:flex">
            <div className="flex items-start gap-2 border-b border-white/[0.06] px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-300 ring-1 ring-teal-400/20">
                <Icon name="skills" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{selected.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/40">
                  {selected.source}
                  {selected.bundled ? ' · bundled' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close skill detail"
                className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 hover:bg-white/[0.1] hover:text-white"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xs text-white/75">
              <p className="mb-3 leading-relaxed">{selected.description}</p>
              {selected.homepage && (
                <a
                  href={selected.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 inline-block text-teal-300 underline hover:text-teal-200"
                >
                  {selected.homepage}
                </a>
              )}
              {!selected.eligible && (
                <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  <div className="font-semibold">Missing requirements</div>
                  {selected.missing.bins.length > 0 && (
                    <div>bins: {selected.missing.bins.join(', ')}</div>
                  )}
                  {selected.missing.env.length > 0 && (
                    <div>env: {selected.missing.env.join(', ')}</div>
                  )}
                  {selected.missing.config.length > 0 && (
                    <div>config: {selected.missing.config.join(', ')}</div>
                  )}
                </div>
              )}
              <pre className="whitespace-pre-wrap rounded-lg bg-white/[0.03] p-2 text-[10px] leading-snug text-white/55">
                {detailInfo || 'Loading…'}
              </pre>
            </div>
            <div className="shrink-0 border-t border-white/[0.06] p-3">
              <input
                type="text"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder={`What should "${selected.name}" do?`}
                className="mb-2 w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-teal-400/35"
              />
              <button
                type="button"
                onClick={() => void runSelected()}
                disabled={running}
                className="w-full rounded-lg bg-gradient-to-b from-teal-500 to-teal-600 py-2 text-xs font-semibold text-white shadow disabled:opacity-40"
              >
                {running ? 'Running…' : `Run "${selected.name}" via openclaw agent`}
              </button>
              {lastRun && (
                <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/[0.04] p-2 text-[10px] text-white/70">
                  {lastRun}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
