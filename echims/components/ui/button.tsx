import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

// Also used on <Link> and <a>: className={buttonVariants({ variant: 'secondary' })}
const variants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-55 aria-busy:cursor-progress [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-white shadow-sm hover:bg-primary/90',
        secondary: 'border-brand-line bg-white text-brand-navy hover:bg-brand-ice',
        // Secondary/added actions that should stand out a little (Send reminder, Print, View history…):
        // very light brand-blue fill, no visible border, navy text, brand-blue icon, medium weight.
        // Disabled: flat gray-blue with muted text (no fade), so it still reads but clearly is off.
        tonal: 'border-transparent bg-brand-blue/[0.07] font-medium text-brand-navy hover:bg-brand-blue/[0.13] active:bg-brand-blue/[0.18] focus-visible:ring-brand-blue/35 [&_svg]:text-brand-blue disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 disabled:[&_svg]:text-slate-400',
        ghost: 'border-transparent bg-transparent text-brand-navy hover:bg-brand-ice',
        danger: 'border-transparent bg-danger text-white shadow-sm hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

// Merged so a variant's font/opacity overrides the base (also when used on <Link>).
const buttonVariants = (props?: VariantProps<typeof variants>) => cn(variants(props))

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
}

function Button({ className, variant, size, loading = false, disabled, type = 'button', children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
