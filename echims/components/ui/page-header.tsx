'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { usePathname } from '@/lib/offline/navigation'
import { menuGroups } from '@/components/dashboard/sidebar'
import { moduleTabs } from '@/lib/echims-data'

export type Crumb = { label: string; href?: string }

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`)

/** Sidebar module, then its tab (if any): /vaccination/records → Vaccination › Records. */
function crumbsFor(path: string): Crumb[] {
  const item = menuGroups.flatMap((g) => g.items).find((i) => [i.href, ...(i.matchPrefixes ?? [])].some((p) => under(path, p)))
  if (!item) return []
  const crumbs: Crumb[] = [{ label: item.label, href: item.href }]
  const tab = moduleTabs[item.label]?.find((t) => under(path, t.href))
  if (tab && tab.label !== item.label) crumbs.push({ label: tab.label, href: tab.href })
  return crumbs
}

/** Page title block. Breadcrumbs come from the route unless given; a single crumb is not shown. */
export function PageHeader({ title, subtitle, breadcrumbs, actions, className = '' }: {
  title: ReactNode
  subtitle?: ReactNode
  breadcrumbs?: Crumb[]
  actions?: ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const crumbs = breadcrumbs ?? crumbsFor(pathname)
  return (
    <header className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="min-w-0">
        {crumbs.length > 1 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-sm font-medium text-brand-muted">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1
                return (
                  <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                    {last || !c.href
                      ? <span aria-current={last ? 'page' : undefined} className={last ? 'font-semibold text-brand-navy' : ''}>{c.label}</span>
                      : <Link href={c.href} className="rounded hover:text-brand-navy hover:underline underline-offset-4">{c.label}</Link>}
                    {!last && <ChevronRight size={14} aria-hidden="true" className="text-brand-muted/60" />}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-navy">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-3xl text-sm text-brand-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </header>
  )
}
