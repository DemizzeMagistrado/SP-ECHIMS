import Image from 'next/image'

// Source PNGs are 1200px wide; ratios are width / height.
const files = {
  wordmark: { dark: '/brand/echims-wordmark-dark.png', light: '/brand/echims-wordmark-light.png', ratio: 1200 / 412 },
  icon: { dark: '/brand/echims-icon.png', light: '/brand/echims-icon.png', ratio: 1200 / 1171 },
  mark: { dark: '/brand/echims-mark.png', light: '/brand/echims-mark.png', ratio: 1 },
} as const

export const brandIcon = files.icon.dark

type Props = {
  variant?: keyof typeof files
  /** dark = navy art for light backgrounds, light = white art for dark backgrounds. */
  tone?: 'light' | 'dark'
  /** Rendered height in px. Sets the 1x/2x source sizes, so keep it close to the real size. */
  size?: number
  className?: string
  priority?: boolean
}

export function Logo({ variant = 'wordmark', tone = 'dark', size = 40, className = '', priority }: Props) {
  const file = files[variant]
  const image = (
    <Image
      src={file[tone]}
      alt="eCHIMS"
      width={Math.round(size * file.ratio)}
      height={size}
      priority={priority}
      className={variant === 'icon' && tone === 'light' ? 'h-full w-auto' : `h-auto w-auto ${className}`}
      style={variant === 'icon' && tone === 'light' ? undefined : { height: size }}
    />
  )
  // The icon is a navy disc, which disappears on navy. Seat it on a white disc there.
  if (variant === 'icon' && tone === 'light') {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white p-[3px] ${className}`} style={{ height: size, width: size }}>
        {image}
      </span>
    )
  }
  return image
}
