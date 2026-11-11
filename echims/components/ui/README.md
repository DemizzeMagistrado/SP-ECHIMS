# Shared UI (`components/ui/`)

Reuse these in per-module work instead of hand-building the same thing again. They follow the
brand tokens in `app/globals.css` (navy/sky palette, `good`/`warn`/`danger`/`nutrition` tones,
Inter body, Plus Jakarta Sans titles).

Already mounted once in `app/layout.tsx`: `<Toaster/>`, `<ConfirmHost/>`, `<ArrowKeyTabs/>`, `<ModalA11y/>`.
The dashboard layout adds the skip link, offline banner and `<PrintHeader/>`.

## Page structure (Alerts is the reference)
1. `TabBar` (if the module has sub-pages) · 2. `PageHeader` · 3. stat cards · 4. filter row
(`FilterChips` + selects/search) · 5. content. The dashboard layout sets padding and max width; the
page root is `space-y-6`.

## TabBar / FilterChips — `module-tabs.tsx`
Module tabs: navy pill slides to the active tab, the row scrolls sideways on phones. State tabs pass
`onChange` and wrap content in `<TabPanel tabKey={value}>` (fade, height held). Route tabs give
items an `href`; `components/dashboard/module-tabs.tsx` builds those from `moduleTabs` + role.
`idBase` wires `id`/`aria-controls` to your `role="tabpanel"`s. `FilterChips` are the smaller,
round filter buttons (`count` adds a number badge). Segmented switches inside a widget (chart range,
calendar Month/Week/Day) are not tabs and keep their own look.
```tsx
<TabBar label="Alert sections" value={tab} onChange={setTab} items={[{ value: 'ALERTS', label: 'Alerts' }, …]} />
<FilterChips label="Filter alerts" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, …]} />
```

## PageHeader — `page-header.tsx`
Display-font title, one-line muted subtitle, `actions` on the right (wrap below on mobile). No breadcrumbs.
```tsx
<PageHeader title="Stock Overview" subtitle="Quantity on hand per item and barangay."
  actions={<Button onClick={openStockIn}><Plus size={16} /> Record stock-in</Button>} />
```

## Button — `button.tsx`
`variant`: `primary` (default) · `secondary` · `ghost` · `danger`; `size`: `sm` · `md` (default) · `icon`;
`loading` shows a spinner and disables. Defaults to `type="button"`. For links use `buttonVariants()`:
```tsx
<Button variant="danger" loading={deleting} onClick={remove}>Delete</Button>
<Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>Back</Link>
```

## Form controls — `form.tsx`
`Field` wires label, required marker, hint and error (red, linked with `aria-describedby`, sets
`aria-invalid`) to the control inside it. Controls: `Input`, `DateInput`, `Select`, `Textarea`,
`Checkbox`, `Radio` (the last two take `label` and `hint`). `controlClass` is exported for odd cases.
```tsx
<Field label="Birth date" required hint="As on the birth certificate" error={errors.dob}>
  <DateInput value={dob} onChange={(e) => setDob(e.target.value)} />
</Field>
<Checkbox label="Guardian consents to SMS" checked={ok} onChange={(e) => setOk(e.target.checked)} />
```

## DataTable — `data-table.tsx`
Client-side table with sticky header, sortable columns (give a column `sortValue`), pagination
with page size (`pageSize`, 0 = off), right-aligned numbers (`align: 'right'`), `toolbar` slot for
search/filters, EmptyState when empty (`empty` = EmptyState props), `refreshing` dims rows in place
while a refetch runs (`isLoading && !!data` with SWR `keepPreviousData`). `mobile="cards"` stacks rows
as cards below `sm`; default is horizontal scroll.
```tsx
<DataTable rows={rows} rowKey={(r) => r.id} refreshing={isLoading && !!data}
  empty={{ icon: Package, title: 'No stock recorded yet' }}
  columns={[
    { key: 'item', header: 'Item', cell: (r) => r.name, sortValue: (r) => r.name },
    { key: 'qty', header: 'Qty', cell: (r) => r.qty, sortValue: (r) => r.qty, align: 'right' },
  ]} />
```

## StatusBadge — `status-badge.tsx`
One pastel chip for every status. Pass the raw status (any case, `_` or `-`); tone is looked up
(approved/completed → good, pending/due-soon/low-stock → warn, rejected/overdue/at-risk/expired →
danger, upcoming/ongoing → info, cancelled/inactive → neutral). Props: `status`, `label?`, `tone?`,
`dot?`, `icon?`. `statusTone(status)` gives the tone alone.
```tsx
<StatusBadge status={row.status} />  <StatusBadge status="due-soon" label="Due in 3 days" dot />
```

## EmptyState — `empty-state.tsx`
`icon?`, `title`, `description?`, `action?`, `size?: 'page' | 'section'`. Write specific copy
("No defaulters right now", not "No data").

## Toasts — `toast.tsx`
`toast.success(msg)`, `toast.error(msg)` (stays until closed), `toast.info`, `toast.warning`,
`toast.dismiss(id)`; optional `{ durationMs }`. Works outside React too. Use for save/update/delete/
approve/upload/sync results instead of inline "Saved!" banners.

## ConfirmDialog — `confirm-dialog.tsx`
```tsx
const confirm = useConfirm()
if (!(await confirm({ title: 'Delete this draft?', description: '…', confirmLabel: 'Delete', tone: 'danger' }))) return
// or keep the dialog open with a loading button while the work runs (throws → promise rejects):
await confirm({ title: 'Approve request?', action: () => approve(id) })
```
`<ConfirmDialog open … onConfirm onCancel />` is the presentational piece if you need it inline.

## StatusPage — `status-page.tsx`
Logo + title + message + actions, used by the 404 and error pages. `area="content"` inside the dashboard.

## Others
- `arrow-key-tabs.tsx`: arrow keys for any `[role=tablist]` and `[data-arrow-nav]` link bar — just use the roles.
- `modal-a11y.tsx`: give a hand-built overlay `role="dialog" aria-modal="true"` and it gets focus-in, a Tab trap, focus return and Esc (presses its Close/Cancel button, only while nothing has been typed). Prefer a native `<dialog>` for new modals.
- `print-header.tsx`: wordmark + print time, visible only on paper. Mark extra screen-only bits with `print-hide`.
- Offline: call `reportSync(sent, failed)` from `lib/offline/refresh` when a queue drains; the banner shows the toast.
