"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useRef, useState } from "react";
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { Package, Plus, RefreshCw } from "lucide-react";
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { useRefreshSignal } from '@/components/brand/loader-state'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { REPORT_CARD } from '@/components/ui/report-parts'
import { cn } from '@/lib/utils'
import { ResubmitStockRequestModal } from "@/components/inventory/resubmit-stock-request-modal";
import { BatchNumberField, checkBatchNumber } from '@/components/inventory/batch-number-field'
import { Modal } from '@/components/ui/modal'
import { DateInput, Input, Select, Textarea } from '@/components/ui/form'
import { Pagination, usePagination } from '@/components/ui/pagination'
type Product = { supplement_id: number; name: string; unit: string };
type Barangay = {
  barangay_id: number;
  barangay_name: string;
  rhu_name: string;
};
type StockRequest = {
  stock_request_id: number;
  request_date: string;
  requested_quantity: number | string;
  status: string;
  remarks: string | null;
  reason: string | null;
  item_name: string;
  unit: string;
  barangay_name: string;
  rhu_name: string;
  requester_name: string;
  batch_number?: string | null;
  supplement_approval_mode?: string | null;
  requested_by?: string;
};
type Data = {
  currentUserId: string;
  role: string;
  canRequest: boolean;
  canReturn: boolean;
  canApprove: boolean;
  allocationConnected: boolean;
  products: Product[];
  barangays: Barangay[];
  requests: StockRequest[];
};
function manilaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((p) => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const endpoint = "/api/supplementation/stock-requests";
export function SupplementStockRequestsPanel({
  ownerId,
  online = true,
  onStockChanged,
}: {
  ownerId: string;
  online?: boolean;
  onStockChanged?: () => void;
}) {
  // Revisiting the tab starts from the last result: only a first load holds the tab; a refresh
  // behind data on screen drives the top progress bar instead.
  const [data, setData] = useState<Data | null>(() => readPageCache<Data>(ownerId, "supplement-stock-requests") ?? null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  usePageLoading(loading && !data)
  useRefreshSignal(loading && Boolean(data))
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [form, setForm] = useState({
    supplementId: "",
    barangayId: "",
    quantity: "",
    remarks: "",
  });
  const [returning, setReturning] = useState<StockRequest | null>(null);
  const [resubmitting, setResubmitting] = useState<StockRequest | null>(null);
  const [approve, setApprove] = useState<StockRequest | null>(null);
  const [batch, setBatch] = useState({
    batchNumber: "",
    expiryDate: "",
    receivedDate: "",
  });
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const [reason, setReason] = useState("");
  const intent = useRef<{ signature: string; id: string } | null>(null);
  const saving = useRef(false);
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    if (!online) {
      setLoading(false);
      return () => controller.abort();
    }
    // The list stays on screen while it reloads (the panel remounts for another account).
    setOpen(false);
    setReturning(null);
    setApprove(null);
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await r.json();
        if (!r.ok)
          throw new Error(body.error || "Unable to load stock requests.");
        if (
          body.currentUserId !== ownerId ||
          !Array.isArray(body.requests) ||
          !Array.isArray(body.products) ||
          !Array.isArray(body.barangays)
        )
          throw new Error("Invalid stock-request response or session changed.");
        if (current) {
          setData(body);
          writePageCache(ownerId, "supplement-stock-requests", body);
          setError("");
        }
      } catch (e) {
        if (current && !controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Unable to load requests.");
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [ownerId, online, reload]);
  const product = data?.products.find(
    (p) => String(p.supplement_id) === form.supplementId,
  );
  function change(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    intent.current = null;
  }
  async function submit(action: "REQUEST" | "RETURN" | "APPROVE") {
    if (saving.current || !online || !data) return;
    if (
      (action === "REQUEST" && !data.canRequest) ||
      (action === "RETURN" && !data.canReturn) ||
      (action === "APPROVE" && !data.canApprove)
    )
      return;
    if (
      action === "REQUEST" &&
      (!product ||
        !form.barangayId ||
        !/^\d+$/.test(form.quantity) ||
        Number(form.quantity) < 1 ||
        Number(form.quantity) > 1000000)
    ) {
      setError(
        "Choose a product, assigned barangay and whole stock-unit quantity from 1 to 1000000.",
      );
      return;
    }
    if (action === "RETURN" && (!returning || !reason.trim())) {
      setError("Say what the requester needs to change.");
      return;
    }
    if (
      action === "APPROVE" &&
      (!approve ||
        checkBatchNumber(batch.batchNumber, true).error !== null ||
        !batch.expiryDate ||
        !batch.receivedDate)
    ) {
      setError("Enter the approved batch number, expiry and allocation date.");
      return;
    }
    const submittingOwner = ownerId;
    const values =
      action === "REQUEST"
        ? {
            action,
            supplementId: Number(form.supplementId),
            barangayId: Number(form.barangayId),
            quantity: Number(form.quantity),
            remarks: form.remarks.trim(),
          }
        : action === "APPROVE"
          ? {
              action,
              stockRequestId: approve!.stock_request_id,
              batchNumber: checkBatchNumber(batch.batchNumber, true).value,
              expiryDate: batch.expiryDate,
              receivedDate: batch.receivedDate,
            }
          : {
              action,
              stockRequestId: returning!.stock_request_id,
              reason: reason.trim(),
            };
    const signature = JSON.stringify(values);
    if (!intent.current || intent.current.signature !== signature)
      intent.current = { signature, id: crypto.randomUUID() };
    const controller = new AbortController();
    pending.current = controller;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, requestId: intent.current.id }),
        signal: controller.signal,
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Unable to save request.");
      if (active.current && owner.current === submittingOwner) {
        setNotice(body.message);
        if (action === "APPROVE") onStockChanged?.();
        setOpen(false);
        setReturning(null);
        setApprove(null);
        intent.current = null;
        setReload((v) => v + 1);
      }
    } catch (e) {
      if (
        active.current &&
        owner.current === submittingOwner &&
        !controller.signal.aborted
      )
        setError(
          e instanceof Error
            ? e.message
            : "Submission uncertain. Retry unchanged.",
        );
    } finally {
      saving.current = false;
      pending.current = null;
      if (active.current && owner.current === submittingOwner) setBusy(false);
    }
  }
  const shownRequests = (data?.requests ?? []).filter((r) => filter === "ALL" || r.status === filter);
  const { visible: pagedRequests, props: requestPager } = usePagination(shownRequests);
  const head = "px-4 py-3 text-left align-bottom text-[13px] font-semibold text-brand-navy whitespace-nowrap";
  const cell = "px-4 py-3.5 align-top";
    return (
    <section aria-label="Supplement batch stock requests" className={REPORT_CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-line px-4 py-3">
        <div className="min-w-0 flex-[1_1_20rem]">
          <h3 className="text-base font-semibold text-brand-navy">Supplement Batch Stock Requests</h3>
          <p className="mt-0.5 text-sm text-brand-muted">
            RHM requests stock for an assigned barangay. PHN reviews the
            request.
          </p>
        </div>
        {data?.canRequest && (
          <Button
            disabled={busy || !online}
            onClick={() => {
              setForm({
                supplementId: "",
                barangayId: "",
                quantity: "",
                remarks: "",
              });
              intent.current = null;
              setOpen(true);
              setError("");
              setNotice("");
            }}
          >
            <Plus size={17} aria-hidden="true" /> Request Batch Stock
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-4 border-b border-brand-line/70 p-4">
        <div className="w-full sm:w-64">
          <Select aria-label="Request status" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["ALL", "PENDING", "NEEDS_REVISION", "APPROVED"].map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All statuses" : s === "NEEDS_REVISION" ? "Needs revision" : s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" className="ml-auto" disabled={loading || busy || !online} onClick={() => setReload((v) => v + 1)}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </Button>
      </div>
      <div className="space-y-2 px-4 pt-4 empty:hidden">
        <p className="rounded-xl border border-review-line/40 bg-review-soft px-3 py-2 text-sm text-review">
          Temporary stock test: PHN approval records a batch receipt directly into
          the barangay. RHU source stock is not deducted yet. Pending requests do
          not reserve stock.
        </p>
        {!online && (
          <p className="text-sm text-review">
            Reconnect to submit or review stock requests. Stock requests are not
            queued offline.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm font-semibold text-good">
            {notice}
          </p>
        )}
      </div>
      {loading && !data ? (
        <Spinner showLabel label="Loading stock requests…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      ) : (
        data && (
          <>
            <div className="scroll-subtle mt-4 overflow-x-auto border-t border-brand-line">
              <table className="data-grid w-full text-sm text-brand-navy">
                <thead>
                  <tr>
                    {[
                      "Request",
                      "Supplement",
                      "Barangay / RHU",
                      "Quantity",
                      "Status",
                      "Remarks / Review",
                      "Action",
                    ].map((h) => (
                      <th key={h} scope="col" className={cn(head, h === "Quantity" && "text-right")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7}><EmptyState icon={Package} title="No requests in this view" description="Try a different status filter." /></td>
                    </tr>
                  ) : (
                    pagedRequests.map((r, i) => (
                      <tr key={r.stock_request_id} data-zebra={i % 2 === 1 || undefined}>
                        <td className={cn(cell, "whitespace-nowrap")}>
                          <span className="font-semibold">#{r.stock_request_id}</span>
                          <span className="block text-xs text-brand-muted">
                            {r.request_date} · {r.requester_name}
                          </span>
                        </td>
                        <td className={cn(cell, "min-w-40")}>{r.item_name}</td>
                        <td className={cn(cell, "min-w-36")}>
                          {r.barangay_name}
                          <span className="block text-xs text-brand-muted">{r.rhu_name}</span>
                        </td>
                        <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
                          {r.requested_quantity} {r.unit}
                        </td>
                        <td className={cell}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className={cn(cell, "min-w-48")}>
                          {r.remarks || <span className="text-brand-muted">—</span>}
                          {r.batch_number && (
                            <span className="block text-xs text-brand-muted">Batch: {r.batch_number}</span>
                          )}
                          {r.supplement_approval_mode === "TEMPORARY_RECEIPT" && (
                            <span className="block text-xs font-semibold text-review">Temporary barangay receipt</span>
                          )}
                          {r.reason && (
                            <span className="mt-1 block text-[#9C6B10]">{r.status === "NEEDS_REVISION" ? "To change" : "PHN note"}: {r.reason}</span>
                          )}
                        </td>
                        <td className={cn(cell, "min-w-40")}>
                          {data.canReturn && r.status === "PENDING" ? (
                            <div className="grid gap-2">
                              <Button
                                variant="row"
                                size="row"
                                disabled={busy || !online || !data.canApprove}
                                onClick={() => {
                                  setApprove(r);
                                  setError("");
                                  setNotice("");
                                  setBatch({
                                    batchNumber: "",
                                    expiryDate: "",
                                    receivedDate: manilaToday(),
                                  });
                                }}
                              >
                                Approve Batch
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy || !online}
                                onClick={() => {
                                  setReturning(r);
                                  setReason("");
                                  setError("");
                                }}
                              >
                                Return for revision
                              </Button>
                            </div>
                          ) : r.status === "NEEDS_REVISION" && r.requested_by === data.currentUserId ? (
                            <Button variant="row" size="row" disabled={busy || !online} onClick={() => setResubmitting(r)}>
                              Edit and resubmit
                            </Button>
                          ) : (
                            <span className="text-brand-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...requestPager} label="Request pages" />
          </>
        )
      )}
      {open && data?.canRequest && (
        <Modal
          open
          size="lg"
          onClose={() => setOpen(false)}
          busy={busy}
          title="New supplement batch request"
          subtitle={<>Request stock for an assigned barangay. Submits as <strong>PENDING</strong> for PHN review.</>}
          icon={<Package />}
          bodyClassName="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("REQUEST");
          }}
          footer={<Button type="submit" loading={busy} disabled={!online}>{busy ? "Saving…" : "Submit Request"}</Button>}
        >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Supplement
                <Select
                  required
                  disabled={busy}
                  className="mt-1"
                  value={form.supplementId}
                  onChange={(e) => change("supplementId", e.target.value)}
                >
                  <option value="">Choose a catalog supplement</option>
                  {data.products.map((p) => (
                    <option key={p.supplement_id} value={p.supplement_id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                Assigned barangay
                <Select
                  required
                  disabled={busy}
                  className="mt-1"
                  value={form.barangayId}
                  onChange={(e) => change("barangayId", e.target.value)}
                >
                  <option value="">Choose barangay</option>
                  {data.barangays.map((b) => (
                    <option key={b.barangay_id} value={b.barangay_id}>
                      {b.barangay_name} · {b.rhu_name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                Quantity ({product?.unit || "stock units"})
                <Input
                  required
                  disabled={busy}
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  className="mt-1"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Remarks
                <Textarea
                  disabled={busy}
                  maxLength={2000}
                  className="mt-1"
                  value={form.remarks}
                  onChange={(e) => change("remarks", e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              The Inventory approval workflow will assign the actual RHU batch.
              This request does not ask you to invent a batch number or expiry
              date.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
        </Modal>
      )}

      {approve && data?.canApprove && (
        <Modal
          open
          size="lg"
          onClose={() => setApprove(null)}
          busy={busy}
          title={`Approve Request #${approve.stock_request_id}`}
          subtitle={<>{approve.item_name} · {approve.barangay_name} · {approve.requested_quantity} {approve.unit}</>}
          
          bodyClassName="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("APPROVE");
          }}
          footer={<Button type="submit" loading={busy} disabled={!online}>{busy ? "Saving…" : "Approve and Add Batch Stock"}</Button>}
        >
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Temporary barangay receipt. Approving adds the full requested
              quantity immediately. RHU source stock is not deducted.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <BatchNumberField
                required
                value={batch.batchNumber}
                onChange={(v) => setBatch((f) => ({ ...f, batchNumber: v }))}
              />
              <label className="text-sm">
                Expiry date
                <DateInput
                  required
                  disabled={busy}
                  className="mt-1"
                  value={batch.expiryDate}
                  onChange={(e) =>
                    setBatch((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                />
              </label>
              <label className="text-sm">
                Allocation date
                <DateInput
                  required
                  max={manilaToday()}
                  min={approve.request_date}
                  disabled={busy}
                  className="mt-1"
                  value={batch.receivedDate}
                  onChange={(e) =>
                    setBatch((f) => ({ ...f, receivedDate: e.target.value }))
                  }
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
        </Modal>
      )}
      {resubmitting && (
        <ResubmitStockRequestModal
          request={{ ...resubmitting, request_type: "SUPPLEMENT_BATCH", requested_quantity: Number(resubmitting.requested_quantity) }}
          onClose={() => setResubmitting(null)}
          onDone={() => {
            setResubmitting(null);
            setReload((v) => v + 1);
          }}
        />
      )}
      {returning && (
        <Modal
          open
          size="md"
          onClose={() => setReturning(null)}
          busy={busy}
          title={`Return request #${returning.stock_request_id} for revision`}
          subtitle="The RHM sees your note, edits the request and resubmits it."
          bodyClassName="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("RETURN");
          }}
          footer={<Button type="submit" loading={busy} disabled={!online}>Return for revision</Button>}
        >
            <label className="block text-sm">
              What needs to change
              <Textarea
                required
                disabled={busy}
                maxLength={2000}
                className="mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
        </Modal>
      )}
    </section>
  );
}
