import { ChevronRight } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** "View details ›": the outline row button (table rows; full width on the upcoming cards). */
export function DetailsButton({ className, children = 'View details', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 cursor-pointer items-center justify-center gap-[5px] whitespace-nowrap rounded-lg border border-[#BFD3DE] bg-white px-3 text-[13px] font-medium text-[#0C1260] transition-colors duration-[120ms] hover:border-[#07075F] hover:bg-[#E6F1F7] hover:text-[#07075F] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[#0B759A]',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}
