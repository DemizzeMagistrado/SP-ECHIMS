import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export function FormStepper({ steps, label, current, visited, onSelect }: { steps: readonly string[]; label: string; current: number; visited: number; onSelect: (index: number) => void }) {
  return (
    <ol aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border bg-brand-ice/50 px-3 py-3 sm:px-6">
      {steps.map((s, i) => {
        const done = i < current;
        const reachable = i <= visited && i !== current;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(i)}
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
                i === current ? "text-brand-navy" : done ? "text-good" : "text-muted-foreground",
                reachable && "hover:bg-white",
              )}
            >
              <span className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                i === current ? "bg-primary text-white" : done ? "bg-good-soft text-good" : "bg-white text-muted-foreground ring-1 ring-border",
              )}>
                {done ? <Check size={14} aria-hidden="true" /> : i + 1}
              </span>
              <span className="truncate">{s}</span>
              {done && <span className="sr-only">(completed)</span>}
            </button>
            {i < steps.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
