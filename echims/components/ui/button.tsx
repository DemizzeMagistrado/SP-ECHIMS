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
        // Secondary on data pages: white, control border, ink text.
        outline: 'border-control-line bg-white text-brand-navy hover:border-brand-navy/40 hover:bg-brand-ice',
        // Buttons inside table rows (View child record, Scores): clearly buttons, with hover, pressed
        // and a 3px link-colour focus outline. Use with size="row".
        row: 'border-rowbtn-line bg-white text-brand-navy shadow-[0_1px_2px_rgba(12,18,96,0.08)] hover:border-brand-navy hover:bg-rowbtn-hover active:bg-rowbtn-active focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-link',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        // Data-page controls: 44px tall, 10px radius.
        lg: 'h-11 rounded-[10px] px-4 text-sm',
        row: 'h-9 gap-1.5 rounded-[10px] px-3 text-[13px] [&_svg]:size-3.5',
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
