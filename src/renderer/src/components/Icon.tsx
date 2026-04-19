/**
 * A single inline-SVG icon set for the whole app.
 *
 * Design notes:
 * - All icons live in a 24×24 viewBox and use `currentColor` so CSS controls
 *   color via `text-*` utilities — same pattern as lucide / heroicons.
 * - Stroke width 1.5, round caps + joins. Optical weight is consistent so
 *   they line up at any size in the sidebar, header, and composer.
 * - No fills (except where a shape needs it) so the glyphs feel lightweight
 *   against the app's dark translucent surfaces.
 *
 * This is a bespoke set tuned to opencontroller's vocabulary (Skills,
 * Approvals, Flows, MCP, Raw CLI, etc.) rather than pulling a generic
 * library that would force us into less-specific metaphors.
 */

export type IconName =
  | 'chat'
  | 'skills'
  | 'agents'
  | 'channels'
  | 'memory'
  | 'sessions'
  | 'cron'
  | 'tasks'
  | 'flows'
  | 'mcp'
  | 'approvals'
  | 'logs'
  | 'health'
  | 'raw'
  | 'settings'
  | 'mic'
  | 'mic-on'
  | 'speaker'
  | 'speaker-on'
  | 'send'
  | 'close'
  | 'refresh'
  | 'spark'

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export default function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.5
}: Props): JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true
  }
  switch (name) {
    case 'chat':
      return (
        <svg {...common}>
          <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v8A2.5 2.5 0 0 1 17.5 17H9l-4 3.5V6.5Z" />
        </svg>
      )
    case 'skills':
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
        </svg>
      )
    case 'agents':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </svg>
      )
    case 'channels':
      return (
        <svg {...common}>
          <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      )
    case 'memory':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
          <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
          <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
        </svg>
      )
    case 'sessions':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'cron':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="7" />
          <path d="M12 10v3l2 1M9 3h6M12 3v3" />
        </svg>
      )
    case 'tasks':
      return (
        <svg {...common}>
          <path d="M4 7h2l1 1 2-3M4 13h2l1 1 2-3M4 19h2l1 1 2-3" />
          <path d="M12 6h8M12 12h8M12 18h8" />
        </svg>
      )
    case 'flows':
      return (
        <svg {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="12" r="2" />
          <path d="M7 6c5 0 5 6 10 6M7 18c5 0 5-6 10-6" />
        </svg>
      )
    case 'mcp':
      return (
        <svg {...common}>
          <path d="M12 3 3 19h18L12 3Z" />
          <path d="M12 10v5" />
        </svg>
      )
    case 'approvals':
      return (
        <svg {...common}>
          <path d="M12 3 4 6v6c0 4.5 3.5 7.8 8 9 4.5-1.2 8-4.5 8-9V6l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'logs':
      return (
        <svg {...common}>
          <path d="M4 6h16M4 10h16M4 14h10M4 18h16" />
        </svg>
      )
    case 'health':
      return (
        <svg {...common}>
          <path d="M3 12h4l2-4 3 8 2-5 2 3h5" />
        </svg>
      )
    case 'raw':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="15" rx="2" />
          <path d="m7 10 3 2.5L7 15M12 16h5" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.14.68.36.94.64.26.28.46.6.57.94H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      )
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
        </svg>
      )
    case 'mic-on':
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
        </svg>
      )
    case 'speaker':
      return (
        <svg {...common}>
          <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
        </svg>
      )
    case 'speaker-on':
      return (
        <svg {...common}>
          <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
          <path d="M16 9c1.2 1 1.2 5 0 6M18.5 7c2 2 2 8 0 10" />
        </svg>
      )
    case 'send':
      return (
        <svg {...common}>
          <path d="m4 12 16-8-6 16-2-7-8-1Z" />
        </svg>
      )
    case 'close':
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <path d="M12 8 14 12l4 0-3 3 1 4-4-2-4 2 1-4-3-3 4 0 2-4Z" fill="currentColor" opacity=".18" />
        </svg>
      )
  }
}
