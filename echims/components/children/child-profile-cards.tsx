import type { ReactNode } from 'react'

export function ChildProfileBanner({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-border border-l-4 border-l-primary bg-white p-5 shadow-sm sm:p-6">{children}</section>
}

export function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-3 py-2">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
