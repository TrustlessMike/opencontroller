import { Component, type ReactNode } from 'react'

interface Entry {
  id: number
  kind: 'render' | 'rejection' | 'error' | 'console'
  message: string
  stack?: string
  time: number
}

interface State {
  fatal: Error | null
  log: Entry[]
  bannerOpen: boolean
}

/**
 * Catches render-time errors AND subscribes to every runtime error source
 * we know about (window.error, unhandledrejection, console.error).
 *
 * Instead of white-screening the app, we show a persistent red banner at the
 * top with the most recent error and a "show details" expander. That way
 * the user can always see what broke and copy the stack.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { fatal: null, log: [], bannerOpen: false }
  private idCounter = 0
  private origConsoleError: ((...args: unknown[]) => void) | null = null

  private push(kind: Entry['kind'], message: string, stack?: string): void {
    const entry: Entry = {
      id: ++this.idCounter,
      kind,
      message,
      stack,
      time: Date.now()
    }
    this.setState((s) => ({ log: [...s.log.slice(-49), entry] }))
  }

  private rejectionListener = (e: PromiseRejectionEvent): void => {
    const err =
      e.reason instanceof Error
        ? e.reason
        : new Error(typeof e.reason === 'string' ? e.reason : JSON.stringify(e.reason))
    this.origConsoleError?.('[unhandledrejection]', err)
    this.push('rejection', err.message, err.stack)
  }

  private errorListener = (e: ErrorEvent): void => {
    const err = e.error ?? new Error(e.message)
    this.origConsoleError?.('[window.error]', err)
    this.push('error', err.message || String(e.message), err.stack)
  }

  componentDidMount(): void {
    window.addEventListener('unhandledrejection', this.rejectionListener)
    window.addEventListener('error', this.errorListener)

    // Tee console.error into our log so any library throw is visible.
    this.origConsoleError = console.error.bind(console)
    console.error = (...args: unknown[]): void => {
      try {
        this.origConsoleError?.(...args)
        const joined = args
          .map((a) =>
            a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)
          )
          .join(' ')
        // Avoid recursive loop if our push throws.
        this.push('console', joined.slice(0, 400))
      } catch {
        /* ignore */
      }
    }
  }

  componentWillUnmount(): void {
    window.removeEventListener('unhandledrejection', this.rejectionListener)
    window.removeEventListener('error', this.errorListener)
    if (this.origConsoleError) console.error = this.origConsoleError
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { fatal: error }
  }

  componentDidCatch(error: Error, info: unknown): void {
    this.origConsoleError?.('react boundary:', error, info)
    this.push('render', error.message, error.stack)
  }

  render(): ReactNode {
    const { fatal, log, bannerOpen } = this.state
    const latest = log[log.length - 1]

    if (fatal) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-base font-semibold text-rose-200">UI crashed.</div>
          <pre className="max-h-[60vh] max-w-2xl overflow-auto whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-left text-xs text-white/75">
            {fatal.stack ?? fatal.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  void navigator.clipboard.writeText(fatal.stack ?? fatal.message)
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/[0.12]"
            >
              Copy stack
            </button>
            <button
              type="button"
              onClick={() => this.setState({ fatal: null })}
              className="rounded-lg bg-teal-500/25 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-500/40"
            >
              Dismiss and try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/[0.12]"
            >
              Reload window
            </button>
          </div>
        </div>
      )
    }

    return (
      <>
        {this.props.children}
        {latest && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex justify-center p-3">
            <div className="pointer-events-auto flex max-w-xl items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-950/90 px-3 py-2 text-[11px] text-rose-100 shadow-2xl backdrop-blur-sm">
              <span className="shrink-0 text-rose-300">⚠</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{latest.kind}: {latest.message}</div>
                {bannerOpen && latest.stack && (
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-rose-200/80">
                    {latest.stack}
                  </pre>
                )}
              </div>
              <button
                type="button"
                onClick={() => this.setState({ bannerOpen: !bannerOpen })}
                className="shrink-0 rounded bg-rose-800/50 px-1.5 py-0.5 text-[10px] hover:bg-rose-700/70"
              >
                {bannerOpen ? 'hide' : 'more'}
              </button>
              <button
                type="button"
                onClick={() => this.setState({ log: [] })}
                className="shrink-0 rounded bg-rose-800/50 px-1.5 py-0.5 text-[10px] hover:bg-rose-700/70"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </>
    )
  }
}
