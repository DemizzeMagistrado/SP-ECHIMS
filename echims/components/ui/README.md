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

## StatCard — `stat-card.tsx`
Summary count: white card, muted label, big number with the tone on the number only
(`default` · `good` · `warn` · `danger` · `info` · `nutrition`), optional `hint` and `icon`. Pass
`onClick` + `pressed` when the card doubles as a filter. Row: `grid grid-cols-2 gap-4 md:grid-cols-4`.
```tsx
<StatCard label="Critical" value={summary.critical} tone="danger" />
```

## PageHeader — `page-header.tsx`
Display-font title, one-line muted subtitle, `actions` on the right (wrap below on mobile). No breadcrumbs.
```tsx
<PageHeader title="Stock Overview" subtitle="Quantity on hand per item and barangay."
  actions={<Button onClick={openStockIn}><Plus size={16} /> Record stock-in</Button>} />
```

## Button — `button.tsx`
`variant`: `primary` (default, solid navy: the one main action) · `secondary` (white outline: neutral) · `tonal`
(very light brand-blue fill, no border, navy medium text, blue icon; flat gray when disabled: secondary
actions that should stand out a little, e.g. Send reminder, Print, Export, Refresh, SMS history; use
it sparingly, one or two per area, and `ghost` for the rest) · `ghost` · `danger`; `size`: `sm` · `md` (default) · `icon`;
`loading` shows a spinner and disables. Defaults to `type="button"`. For links use `buttonVariants()`:
```tsx
<Button variant="danger" loading={deleting} onClick={remove}>Delete</Button>
<Link href="/dashboard" className={buttonVariants({ variant: 'secondary' })}>Back</Link>
```

## Form controls — `form.tsx`
`Field` wires label, required marker, hint and error (red, linked with `aria-describedby`, sets
`aria-invalid`) to the control inside it. Controls: `Input`, `DateInput`, `Select`, `Textarea`,
`Checkbox`, `Radio` (the last two take `label` and `hint`), `Combobox` (pick-or-type text with styled
suggestions that filter as you type: `value`, `onChange(value)`, `options`; never use `<datalist>`). `controlClass` is exported for odd cases.
`Select` keeps the native `<select>` API (`<option>`/`<optgroup>` children, `value`/`onChange(e)`,
or `name` + `defaultValue` in a FormData form) but renders the shared dropdown: styled menu in a
portal (no clipping in cards/modals, flips near screen edges), keyboard navigation and type-ahead,
and a search box when there are more than 10 options (`searchable` forces it). Never use a raw `<select>`.
`DateInput` is the shared date picker with the `<input type="date">` API (`value`/`min`/`max` as
YYYY-MM-DD, `onChange(e)` gives `e.target.value`, or `name` + `defaultValue`): typing MM/DD/YYYY
(validated against min/max), calendar popover with month/year quick pick, Today and Clear, keyboard
navigation, bottom sheet on phones. Always pass `min`/`max` where they apply (no future birth dates,
no vaccination before birth). Never use a raw `type="date"`.
```tsx
<Field label="Birth date" required hint="As on the birth certificate" error={errors.dob}>
  <DateInput value={dob} onChange={(e) => setDob(e.target.value)} />
</Field>
<Checkbox label="Guardian consents to SMS" checked={ok} onChange={(e) => setOk(e.target.checked)} />
```

## DataTable — `data-table.tsx`
Client-side table with sticky header, sortable columns (give a column `sortValue`), pagination
(6 per page, the shared `PAGE_SIZE`; `pageSize={0}` turns it off), right-aligned numbers (`align: 'right'`), `toolbar` slot for
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

## Pagination — `pagination.tsx`
Every paginated list shows at most 6 items (`PAGE_SIZE`). `usePagination(rows)` returns `visible`,
`bindList` (ref for the list's outer element: keeps its height steady and scrolls back to its top)
and `props` for `<Pagination/>` (Previous / Next, page numbers, "Showing 1–6 of 42"; compact on phones).
Destructure the result (the React compiler lint reads `pager.bindList` as a ref access).
```tsx
const { visible, bindList, listStyle, props } = usePagination(rows)
<ul ref={bindList} style={listStyle}>{visible.map(…)}</ul>
<Pagination {...props} label="Child pages" />
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

## FilterBar — `filter-bar.tsx`
Layout for pages with many filters: `chips` on top, `search` on its own full-width row, the filters
(children) in a 2-column grid (1 column on phones), then `info` (left) and `actions` (right, e.g.
`ExpandCollapseAll`). Used on Vaccination › Schedule.

## LoadError — `load-error.tsx`
When a list or page fails to load: plain-language message plus a "Try again" button; the technical
error goes to the console only. `<LoadError what="vaccination records" error={error} onRetry={() => mutate()} />`

## Toasts — `toast.tsx`
`toast.success(msg)`, `toast.error(msg)` (stays until closed), `toast.info`, `toast.warning`,
`toast.dismiss(id)`; optional `{ durationMs }`. Works outside React too. Use for save/update/delete/
approve/upload/sync results instead of inline "Saved!" banners.

## Modal — `modal.tsx`
Every button that opens a form (Add, Record, Edit, Register, Request…) opens it in this one Modal:
centered on desktop (backdrop fade + panel scale, ~200ms), bottom sheet on phones. Header = title,
short subtitle, close button; footer = Cancel on the left, your actions (`footer`) on the right;
the body scrolls. Esc, backdrop, Cancel and ✕ close it, asking "Discard changes?" when something
was typed. `onSubmit` makes body + footer one `<form>` (a `type="submit"` button in `footer`
submits). Focus trap and focus return come from `<ModalA11y/>`. Don't hand-build overlays.
```tsx
<Modal open={open} onClose={close} title="Record stock-in" subtitle="Adds a batch to inventory."
  busy={saving} onSubmit={save} footer={<Button type="submit" loading={saving}>Save</Button>}>
  …fields…
</Modal>
```
Also: `size` (sm·md·lg·xl), `icon`, `footerStart`, `belowHeader` (e.g. a stepper), `bodyRef`,
`formRef`, `cancelLabel`/`hideCancel`, `dirty`/`confirmDiscard`.

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
- `modal-a11y.tsx`: gives `role="dialog" aria-modal="true"` overlays (the shared Modal) focus-in, a Tab trap and focus return. Don't use a native `<dialog>` for forms: it sits in the browser's top layer, so Select/DatePicker menus would open behind it.
- `print-header.tsx`: wordmark + print time, visible only on paper. Mark extra screen-only bits with `print-hide`.
- Offline: call `reportSync(sent, failed)` from `lib/offline/refresh` when a queue drains; the banner shows the toast.
