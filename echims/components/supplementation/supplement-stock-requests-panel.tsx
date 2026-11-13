"use client";
import { offlineFetch as fetch } from '@/lib/offline/fetch'
import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { Spinner } from '@/components/brand/logo-loader'
import { usePageLoading } from '@/components/brand/page-gate'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
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
};
type Data = {
  currentUserId: string;
  role: string;
  canRequest: boolean;
  canReject: boolean;
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
const button =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
export function SupplementStockRequestsPanel({
  ownerId,
  online = true,
  onStockChanged,
}: {
  ownerId: string;
  online?: boolean;
  onStockChanged?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  usePageLoading(loading)
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
  const [reject, setReject] = useState<StockRequest | null>(null);
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
    setData(null);
    setOpen(false);
    setReject(null);
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
  async function submit(action: "REQUEST" | "REJECT" | "APPROVE") {
    if (saving.current || !online || !data) return;
    if (
      (action === "REQUEST" && !data.canRequest) ||
      (action === "REJECT" && !data.canReject) ||
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
    if (action === "REJECT" && (!reject || !reason.trim())) {
      setError("Enter a rejection reason.");
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
              stockRequestId: reject!.stock_request_id,
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
        setReject(null);
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
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Supplement Batch Stock Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            RHM requests stock for an assigned barangay. PHN reviews the
            request.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary"
            disabled={loading || busy || !online}
            onClick={() => setReload((v) => v + 1)}
          >
            Refresh
          </Button>
          {data?.canRequest && (
            <button
              type="button"
              className={button}
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
              Request Batch Stock
            </button>
          )}
        </div>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Temporary stock test: PHN approval records a batch receipt directly into
        the barangay. RHU source stock is not deducted yet. Pending requests do
        not reserve stock.
      </p>
      {!online && (
        <p className="text-sm text-amber-800">
          Reconnect to submit or review stock requests. Stock requests are not
          queued offline.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-teal-800">
          {notice}
        </p>
      )}
      {loading && !data ? (
        <Spinner showLabel label="Loading stock requests…" className="w-full justify-center py-6 text-sm text-muted-foreground" />
      ) : (
        data && (
          <>
            <label className="block text-sm">
              Request status
              <Select
                className="ml-3"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["ALL", "PENDING", "REJECTED", "APPROVED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50">
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
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.requests.filter(
                    (r) => filter === "ALL" || r.status === filter,
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={7}><EmptyState icon={Package} title="No requests in this view" description="Try a different status filter." /></td>
                    </tr>
                  ) : (
                    pagedRequests
                      .map((r) => (
                        <tr key={r.stock_request_id}>
                          <td className="p-3">
                            #{r.stock_request_id}
                            <p className="text-xs text-muted-foreground">
                              {r.request_date} · {r.requester_name}
                            </p>
                          </td>
                          <td className="p-3">{r.item_name}</td>
                          <td className="p-3">
                            {r.barangay_name}
                            <p className="text-xs text-muted-foreground">
                              {r.rhu_name}
                            </p>
                          </td>
                          <td className="p-3">
                            {r.requested_quantity} {r.unit}
                          </td>
                          <td className="p-3">{r.status}</td>
                          <td className="p-3">
                            {r.remarks || "—"}
                            {r.batch_number && (
                              <p className="text-xs">Batch: {r.batch_number}</p>
                            )}
                            {r.supplement_approval_mode ===
                              "TEMPORARY_RECEIPT" && (
                              <p className="text-xs text-amber-800">
                                Temporary barangay receipt
                              </p>
                            )}
                            {r.reason && (
                              <p className="mt-1 text-red-700">
                                Reason: {r.reason}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            {data.canReject && r.status === "PENDING" ? (
                              <div className="space-y-2">
                                <Button variant="secondary" size="sm"
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
                                <button
                                  type="button"
                                  disabled={busy || !online}
                                  className="block text-red-700 underline disabled:opacity-50"
                                  onClick={() => {
                                    setReject(r);
                                    setReason("");
                                    setError("");
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              "—"
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
      {reject && (
        <Modal
          open
          size="md"
          onClose={() => setReject(null)}
          busy={busy}
          title={`Reject Request #${reject.stock_request_id}`}
          
          
          bodyClassName="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("REJECT");
          }}
          footer={<Button type="submit" loading={busy} disabled={!online}>Confirm Rejection</Button>}
        >
            <label className="block text-sm">
              Reason
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
