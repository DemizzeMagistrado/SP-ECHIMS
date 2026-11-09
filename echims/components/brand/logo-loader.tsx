import { brandIcon } from './logo'

// echims-mark rebuilt at 1/10 scale. Each arm's inner end is cut by the ring gap
// (circle r=36.5 at 60,58), so no mask id is needed when many loaders share a page.
const arms = [
  { d: 'M38 10.5A10.5 10.5 0 0 1 48.5 0H71.5A10.5 10.5 0 0 1 82 10.5V28.88A36.5 36.5 0 0 0 38 28.88Z', from: '0px -14px' },
  { d: 'M90.53 38H109.5A10.5 10.5 0 0 1 120 48.5V71.5A10.5 10.5 0 0 1 109.5 82H87.5A36.5 36.5 0 0 0 90.53 38Z', from: '14px 0px' },
  { d: 'M38 87.12A36.5 36.5 0 0 0 82 87.12V109.5A10.5 10.5 0 0 1 71.5 120H48.5A10.5 10.5 0 0 1 38 109.5Z', from: '0px 14px' },
  { d: 'M10.5 38H29.47A36.5 36.5 0 0 0 32.5 82H10.5A10.5 10.5 0 0 1 0 71.5V48.5A10.5 10.5 0 0 1 10.5 38Z', from: '-14px 0px' },
]

// Centering boxes. content = the dashboard area beside the sidebar and under the 4rem top bar,
// minus <main>'s vertical padding (py-6, lg:py-8).
const BOX = {
  page: 'min-h-dvh',
  content: 'min-h-[calc(100dvh-7rem)] lg:min-h-[calc(100dvh-8rem)]',
  section: 'h-full min-h-48',
} as const

type Props = {
  /** page: full viewport. content: dashboard content area. section: a module's main table/list area. */
  size?: keyof typeof BOX
  label?: string
  className?: string
}

/**
 * Page-level loading only (routes, auth/logout transitions, offline boot, a module's main data).
 * Widgets and buttons use <Spinner>. Hidden for its first 200ms so fast loads never flash it.
 */
export function LogoLoader({ size = 'content', label = 'Loading…', className = '' }: Props) {
  const px = size === 'section' ? 56 : 104
  return (
    <div role="status" aria-live="polite" className={`logo-loader flex w-full flex-col items-center justify-center gap-4 ${BOX[size]} ${className}`}>
      <span className="sr-only">Loading eCHIMS</span>
      <svg aria-hidden width={px} height={px} viewBox="0 0 120 120" className="overflow-visible">
        <g fill="#33446A">
          {arms.map((a, i) => (
            <path key={i} className="logo-loader-arm" d={a.d}
              style={{ '--from': a.from, animationDelay: `${0.2 + i * 0.08}s` } as React.CSSProperties} />
          ))}
        </g>
        <circle className="logo-loader-ring" cx="60" cy="58" r="33.2" fill="none" stroke="var(--brand-sky)" strokeWidth={size === 'section' ? 2.4 : 1.6} strokeLinecap="round" strokeDasharray="36 173" />
        <g className="logo-loader-pop">
          <g className="logo-loader-breathe">
            <image href={brandIcon} x="32.5" y="31.8" width="54" height="52.7" />
          </g>
        </g>
      </svg>
      {label && <p className="text-sm text-brand-muted">{label}</p>}
    </div>
  )
}

/** Small plain spinner for buttons, widgets and small fetches. Takes the text color. */
export function Spinner({ label = 'Loading', showLabel = false, className = '' }: { label?: string; showLabel?: boolean; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-2 align-middle ${className}`}>
      <span aria-hidden className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80 motion-reduce:animate-none" />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  )
}
