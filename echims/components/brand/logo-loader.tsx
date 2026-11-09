import { brandIcon } from './logo'

// echims-mark rebuilt at 1/10 scale: four arms cut by a ring gap, the baby icon in the middle.
const arms = [
  { x: 38, y: 0, w: 44, h: 48, from: '0px -14px' },
  { x: 72, y: 38, w: 48, h: 44, from: '14px 0px' },
  { x: 38, y: 72, w: 44, h: 48, from: '0px 14px' },
  { x: 0, y: 38, w: 48, h: 44, from: '-14px 0px' },
]

type Props = { label?: string; fullScreen?: boolean; className?: string }

/** Branded loading state for pages and sections. Widget-level loading keeps its skeletons. */
export function LogoLoader({ label = 'Loading…', fullScreen = false, className = '' }: Props) {
  const size = fullScreen ? 112 : 84
  return (
    <div
      role="status"
      aria-live="polite"
      className={`logo-loader flex flex-col items-center justify-center gap-4 ${fullScreen ? 'min-h-svh' : 'min-h-[50vh]'} ${className}`}
    >
      <span className="sr-only">Loading eCHIMS</span>
      <svg aria-hidden width={size} height={size} viewBox="0 0 120 120" className="overflow-visible">
        <defs>
          <mask id="logo-loader-gap">
            <rect width="120" height="120" fill="#fff" />
            <circle cx="60" cy="58" r="36.5" fill="#000" />
          </mask>
        </defs>
        <g mask="url(#logo-loader-gap)" fill="#33446A">
          {arms.map((a, i) => (
            <rect key={i} className="logo-loader-arm" x={a.x} y={a.y} width={a.w} height={a.h} rx="10.5"
              style={{ '--from': a.from, animationDelay: `${0.2 + i * 0.08}s` } as React.CSSProperties} />
          ))}
        </g>
        <circle className="logo-loader-ring" cx="60" cy="58" r="33.2" fill="none" stroke="var(--brand-sky)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="36 173" />
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
