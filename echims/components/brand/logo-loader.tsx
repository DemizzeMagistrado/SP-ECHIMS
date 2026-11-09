import { brandIcon } from './logo'

// echims-mark rebuilt at 1/10 scale. Each arm's inner end is cut by the ring gap
// (circle r=36.5 at 60,58), so no mask id is needed when many loaders share a page.
const arms = [
  { d: 'M38 10.5A10.5 10.5 0 0 1 48.5 0H71.5A10.5 10.5 0 0 1 82 10.5V28.88A36.5 36.5 0 0 0 38 28.88Z', from: '0px -14px' },
  { d: 'M90.53 38H109.5A10.5 10.5 0 0 1 120 48.5V71.5A10.5 10.5 0 0 1 109.5 82H87.5A36.5 36.5 0 0 0 90.53 38Z', from: '14px 0px' },
  { d: 'M38 87.12A36.5 36.5 0 0 0 82 87.12V109.5A10.5 10.5 0 0 1 71.5 120H48.5A10.5 10.5 0 0 1 38 109.5Z', from: '0px 14px' },
  { d: 'M10.5 38H29.47A36.5 36.5 0 0 0 32.5 82H10.5A10.5 10.5 0 0 1 0 71.5V48.5A10.5 10.5 0 0 1 10.5 38Z', from: '-14px 0px' },
]

type Props = {
  /** page: full-screen mark. section: small mark centered in a card/table area. inline: tiny pulsing icon for buttons. */
  size?: 'page' | 'section' | 'inline'
  /** Visible text under the mark (page/section). Inline loaders keep it for screen readers only. */
  label?: string
  className?: string
}

/** The one loading indicator for eCHIMS. Hidden for its first 200ms so fast loads never flash it. */
export function LogoLoader({ size = 'section', label = 'Loading…', className = '' }: Props) {
  if (size === 'inline') {
    return (
      <span role="status" aria-live="polite" className={`logo-loader logo-loader-inline inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-white p-px align-middle ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 18px decorative icon, no optimization needed */}
        <img src={brandIcon} alt="" width={16} height={16} className="h-full w-auto" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  const page = size === 'page'
  const px = page ? 112 : 48
  return (
    <div
      role="status"
      aria-live="polite"
      className={`logo-loader flex flex-col items-center justify-center ${page ? 'min-h-svh gap-4' : 'h-full min-h-32 gap-2'} ${className}`}
    >
      <span className="sr-only">Loading eCHIMS</span>
      <svg aria-hidden width={px} height={px} viewBox="0 0 120 120" className="overflow-visible">
        <g fill="#33446A">
          {arms.map((a, i) => (
            <path key={i} className="logo-loader-arm" d={a.d}
              style={{ '--from': a.from, animationDelay: `${0.2 + i * 0.08}s` } as React.CSSProperties} />
          ))}
        </g>
        <circle className="logo-loader-ring" cx="60" cy="58" r="33.2" fill="none" stroke="var(--brand-sky)" strokeWidth={page ? 1.6 : 2.4} strokeLinecap="round" strokeDasharray="36 173" />
        <g className="logo-loader-pop">
          <g className="logo-loader-breathe">
            <image href={brandIcon} x="32.5" y="31.8" width="54" height="52.7" />
          </g>
        </g>
      </svg>
      {label && <p className={page ? 'text-sm text-brand-muted' : 'text-xs text-brand-muted'}>{label}</p>}
    </div>
  )
}
