"use client";
import { useEffect, useRef, useState } from "react";
import { Package, X } from "lucide-react";

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
const endpoint = "/api/supplementation/stock-requests";
const button =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
export function SupplementStockRequestsPanel({
  ownerId,
  online = true,
}: {
  ownerId: string;
  online?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
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
  async function submit(action: "REQUEST" | "REJECT") {
    if (saving.current || !online || !data) return;
    if (
      (action === "REQUEST" && !data.canRequest) ||
      (action === "REJECT" && !data.canReject)
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
    const values =
      action === "REQUEST"
        ? {
            action,
            supplementId: Number(form.supplementId),
            barangayId: Number(form.barangayId),
            quantity: Number(form.quantity),
            remarks: form.remarks.trim(),
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
      if (active.current) {
        setNotice(body.message);
        setOpen(false);
        setReject(null);
        intent.current = null;
        setReload((v) => v + 1);
      }
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Submission uncertain. Retry unchanged.",
        );
    } finally {
      saving.current = false;
      pending.current = null;
      if (active.current) setBusy(false);
    }
  }
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
          <button
            type="button"
            disabled={loading || busy || !online}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => setReload((v) => v + 1)}
          >
            Refresh
          </button>
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
        Requests can be submitted and reviewed. Approval and batch allocation
        will become available when RHU inventory is connected. A pending request
        does not reserve or increase stock.
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
        <p className="text-sm">Loading stock requests…</p>
      ) : (
        data && (
          <>
            <label className="block text-sm">
              Request status
              <select
                className="ml-3 rounded-lg border p-2"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {["ALL", "PENDING", "REJECTED", "APPROVED"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
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
                      <td
                        colSpan={7}
                        className="p-6 text-center text-muted-foreground"
                      >
                        No requests in this view.
                      </td>
                    </tr>
                  ) : (
                    data.requests
                      .filter((r) => filter === "ALL" || r.status === filter)
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
                            {r.reason && (
                              <p className="mt-1 text-red-700">
                                Reason: {r.reason}
                              </p>
                            )}
                          </td>
                          <td className="p-3">
                            {data.canReject && r.status === "PENDING" ? (
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  disabled
                                  className="rounded-lg border px-3 py-1.5 text-xs opacity-50"
                                  title="Waiting for RHU inventory integration"
                                >
                                  Approve — pending integration
                                </button>
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
          </>
        )
      )}
      {open && data?.canRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-request-heading"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("REQUEST");
            }}
            className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <header className="flex items-start gap-3 border-b pb-5">
              <span className="rounded-full bg-sky-100 p-3 text-primary">
                <Package size={20} />
              </span>
              <div className="flex-1">
                <h3
                  id="stock-request-heading"
                  className="text-lg font-semibold"
                >
                  New supplement batch request
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Request stock for an assigned barangay. Submits as{" "}
                  <strong>PENDING</strong> for PHN review.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close request form"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                Supplement
                <select
                  required
                  disabled={busy}
                  className="mt-1 w-full rounded-2xl border p-2.5"
                  value={form.supplementId}
                  onChange={(e) => change("supplementId", e.target.value)}
                >
                  <option value="">Choose a catalog supplement</option>
                  {data.products.map((p) => (
                    <option key={p.supplement_id} value={p.supplement_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Assigned barangay
                <select
                  required
                  disabled={busy}
                  className="mt-1 w-full rounded-2xl border p-2.5"
                  value={form.barangayId}
                  onChange={(e) => change("barangayId", e.target.value)}
                >
                  <option value="">Choose barangay</option>
                  {data.barangays.map((b) => (
                    <option key={b.barangay_id} value={b.barangay_id}>
                      {b.barangay_name} · {b.rhu_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Quantity ({product?.unit || "stock units"})
                <input
                  required
                  disabled={busy}
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  className="mt-1 w-full rounded-2xl border p-2.5"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Remarks
                <textarea
                  disabled={busy}
                  maxLength={2000}
                  className="mt-1 w-full rounded-2xl border p-2.5"
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
            <div className="flex gap-2">
              <button
                type="submit"
                className={button}
                disabled={busy || !online}
              >
                {busy ? "Saving…" : "Submit Request"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {reject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-reject-heading"
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit("REJECT");
            }}
          >
            <h3 id="stock-reject-heading" className="font-semibold">
              Reject Request #{reject.stock_request_id}
            </h3>
            <label className="block text-sm">
              Reason
              <textarea
                required
                disabled={busy}
                maxLength={2000}
                className="mt-1 w-full rounded-2xl border p-2.5"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !online}
                className={button}
              >
                Confirm Rejection
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setReject(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
