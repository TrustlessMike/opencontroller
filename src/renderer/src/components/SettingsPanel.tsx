import { useEffect, useState } from 'react'
import { getSettings, updateSettings, subscribeSettings } from '../settings'
import { canSpeak, canDictate, speak } from '../voice'

/**
 * Renderer-only user preferences. Persists to localStorage; other components
 * subscribe via `subscribeSettings` so a toggle here takes effect immediately.
 */
export default function SettingsPanel(): JSX.Element {
  const [s, setS] = useState(getSettings())
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => subscribeSettings(setS), [])

  // Populate voices — synthesis voices load asynchronously on some platforms.
  useEffect(() => {
    if (!canSpeak()) return
    const refresh = (): void => setVoices(window.speechSynthesis.getVoices())
    refresh()
    window.speechSynthesis.onvoiceschanged = refresh
    return () => {
      if (canSpeak()) window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const toggle = (patch: Partial<typeof s>): void => {
    updateSettings(patch)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="text-sm font-semibold text-white">Settings</div>
        <div className="text-[10px] text-white/40">
          Local UI preferences — stored in this window only.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-5">
          <Group title="Voice">
            <Row
              label="Read replies aloud"
              hint="Uses the system text-to-speech engine (no cloud calls)."
            >
              <Toggle
                checked={s.tts}
                disabled={!canSpeak()}
                onChange={(v) => toggle({ tts: v })}
              />
            </Row>
            <Row label="Voice" hint="Pick any voice installed on your Mac.">
              <select
                value={s.ttsVoice}
                onChange={(e) => toggle({ ttsVoice: e.target.value })}
                disabled={!canSpeak() || voices.length === 0}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/90 focus:outline-none focus:ring-1 focus:ring-teal-400/40 disabled:opacity-40"
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.name} className="bg-neutral-900">
                    {v.name} — {v.lang}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={`Rate (${s.ttsRate.toFixed(1)}×)`} hint="Higher = faster playback.">
              <input
                type="range"
                min={0.6}
                max={1.6}
                step={0.1}
                value={s.ttsRate}
                onChange={(e) => toggle({ ttsRate: Number(e.target.value) })}
                className="w-40 accent-teal-400"
              />
            </Row>
            <Row label="Preview" hint="">
              <button
                type="button"
                onClick={() =>
                  speak(
                    'This is how the assistant will sound when it reads replies aloud.',
                    { rate: s.ttsRate, voice: s.ttsVoice || undefined }
                  )
                }
                disabled={!canSpeak()}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/[0.08] disabled:opacity-40"
              >
                Play sample
              </button>
            </Row>
          </Group>

          <Group title="Microphone">
            <Row
              label="Show mic button"
              hint="Hides the composer mic if you don't want to dictate."
            >
              <Toggle
                checked={s.micButton}
                disabled={!canDictate()}
                onChange={(v) => toggle({ micButton: v })}
              />
            </Row>
            <Row
              label="Push-to-talk shortcut"
              hint="Global hotkey that toggles dictation from anywhere."
            >
              <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                ⌘⌃Space
              </kbd>
            </Row>
          </Group>

          <Group title="Intelligence">
            <Row
              label="Memory grounding"
              hint="Prepend top OpenClaw memory hits to each agent turn for relevant context."
            >
              <Toggle checked={s.grounding} onChange={(v) => toggle({ grounding: v })} />
            </Row>
            <Row
              label="Desktop notifications"
              hint="Pop a native notification when the assistant replies while the window isn't focused."
            >
              <Toggle
                checked={s.notifications}
                onChange={(v) => toggle({ notifications: v })}
              />
            </Row>
          </Group>

          <Group title="Shortcuts">
            <ShortcutRow k="⌘⌥O" v="Summon / hide opencontroller" />
            <ShortcutRow k="⌘⇧Space" v="Fallback summon" />
            <ShortcutRow k="⌘⌃Space" v="Push-to-talk (toggle dictation)" />
            <ShortcutRow k="⌥⌘I" v="Toggle DevTools" />
            <ShortcutRow k="⌘R" v="Reload renderer" />
          </Group>
        </div>
      </div>
    </div>
  )
}

function Group({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/45">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg px-1.5 py-1.5">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-white/85">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] text-white/40">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${
        checked ? 'bg-teal-500/80' : 'bg-white/[0.1]'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function ShortcutRow({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-1.5 py-1 text-[12px] text-white/75">
      <span>{v}</span>
      <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/80">
        {k}
      </kbd>
    </div>
  )
}
