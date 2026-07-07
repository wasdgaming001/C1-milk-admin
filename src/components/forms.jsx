// ── forms.jsx ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { fmt } from "../lib/utils.js";
import { BLUE_L, BLUE } from "../lib/constants.js";
import { useBusy } from "../hooks/useBusy.js";
import {
  Modal,
  Field,
  Btn,
  IS,
  ActiveBrandOptions,
  ActiveCustomerOptions,
} from "./ui.jsx";

// ── Shared Components to eliminate duplication ────────────────────────────────
// fallow-ignore-next-line complexity
function CustomerDateFields({
  form,
  data,
  today,
  customers,
  onChange,
  dateKey = "date",
  dateLabel = "Date *",
}) {
  return (
    <>
      <Field label="Customer *">
        <select
          style={IS()}
          value={form?.custId ?? data?.custId ?? ""}
          onChange={onChange("custId")}
        >
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>
      <Field label={dateLabel}>
        <input
          type="date"
          style={IS()}
          value={form?.[dateKey] ?? today ?? ""}
          onChange={onChange(dateKey)}
        />
      </Field>
    </>
  );
}

// fallow-ignore-next-line complexity
function calculateImportTotal(form, data) {
  const qty = parseFloat(form?.qty ?? data?.qty ?? 0) || 0;
  const rate = parseFloat(form?.rate ?? data?.rate ?? 0) || 0;
  return Math.round(qty * rate * 100) / 100;
}

function getCustomerModalTitle(isEdit) {
  return isEdit ? "Edit Customer" : "Add Customer";
}
function getCustomerModalButtonText(isEdit) {
  return isEdit ? "Update" : "Save";
}

// fallow-ignore-next-line complexity
export function CustomerModal({
  data,
  form,
  isEdit,
  onChange,
  onSave,
  onClose,
  products,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title={getCustomerModalTitle(isEdit)} onClose={onClose}>
      <Field label="Full Name *">
        <input
          style={IS()}
          value={form?.name ?? data?.name ?? ""}
          onChange={onChange("name")}
          placeholder="Ramesh Sharma"
        />
      </Field>
      <Field label="Delivery Address *">
        <input
          style={IS()}
          value={form?.address ?? data?.address ?? ""}
          onChange={onChange("address")}
          placeholder="14, Shivaji Nagar"
        />
      </Field>
      <Field label="Phone (10 digits)">
        <input
          style={IS()}
          value={form?.phone ?? data?.phone ?? ""}
          onChange={onChange("phone")}
          placeholder="9876543210"
        />
      </Field>
      <Field label="Product">
        <select
          style={IS()}
          value={form?.product ?? data?.product ?? "Full Cream"}
          onChange={onChange("product")}
        >
          {products.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Daily Qty (L)">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.qty ?? data?.qty ?? 1}
          onChange={onChange("qty")}
        />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : getCustomerModalButtonText(isEdit)}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
function ImportDateField({ data, form, today, onChange }) {
  return (
    <Field label="Date *">
      <input
        type="date"
        style={IS()}
        value={form?.date ?? data?.date ?? today ?? ""}
        onChange={onChange("date")}
      />
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportBrandField({ data, form, brands, onChange }) {
  return (
    <Field label="Brand *">
      <select
        style={IS()}
        value={form?.brand ?? data?.brand ?? ""}
        onChange={onChange("brand")}
      >
        <option value="">Select Brand</option>
        <ActiveBrandOptions brands={brands} />
      </select>
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportTypeField({ data, form, milkTypes, onChange }) {
  return (
    <Field label="Milk Type *">
      <select
        style={IS()}
        value={form?.type ?? data?.type ?? ""}
        onChange={onChange("type")}
      >
        <option value="">Select Type</option>
        {milkTypes.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportQtyRateField({ data, form, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <Field label="Qty (L) *">
        <input
          type="number"
          style={IS()}
          value={form?.qty ?? data?.qty ?? ""}
          onChange={onChange("qty")}
          placeholder="100"
        />
      </Field>
      <Field label="Rate (₹/L) *">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.rate ?? data?.rate ?? ""}
          onChange={onChange("rate")}
          placeholder="36"
        />
      </Field>
    </div>
  );
}

// fallow-ignore-next-line complexity
function ImportMetaFields({ data, form, onChange }) {
  return (
    <>
      <Field label="Invoice No.">
        <input
          style={IS()}
          value={form?.invoice ?? data?.invoice ?? ""}
          onChange={onChange("invoice")}
          placeholder="INV-2025-001"
        />
      </Field>
      <Field label="Supplier">
        <input
          style={IS()}
          value={form?.supplier ?? data?.supplier ?? ""}
          onChange={onChange("supplier")}
        />
      </Field>
      <Field label="Notes">
        <input
          style={IS()}
          value={form?.notes ?? data?.notes ?? ""}
          onChange={onChange("notes")}
        />
      </Field>
    </>
  );
}

function ImportTotalDisplay({ total }) {
  return (
    <div
      style={{
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        color: "#166534",
        marginBottom: 12,
      }}
    >
      Total: {fmt(total)}
    </div>
  );
}

// fallow-ignore-next-line complexity
export function ImportModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  brands,
  milkTypes,
}) {
  const [busy, save] = useBusy(onSave);
  const total = calculateImportTotal(form, data);
  return (
    <Modal
      title={data.id ? "Edit Import" : "Add Milk Import"}
      onClose={onClose}
    >
      <ImportDateField
        data={data}
        form={form}
        today={today}
        onChange={onChange}
      />
      <ImportBrandField
        data={data}
        form={form}
        brands={brands}
        onChange={onChange}
      />
      <ImportTypeField
        data={data}
        form={form}
        milkTypes={milkTypes}
        onChange={onChange}
      />
      <ImportQtyRateField data={data} form={form} onChange={onChange} />
      <ImportMetaFields data={data} form={form} onChange={onChange} />
      <ImportTotalDisplay total={total} />
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : data.id ? "Update" : "Save Draft"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function PaymentModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  payModes,
  customers = [],
}) {
  const customerName =
    customers.find((c) => c.id === data.custId)?.name || "Unknown Customer";
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title={"Record Payment — " + customerName} onClose={onClose}>
      <div
        style={{
          background: BLUE_L,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          color: BLUE,
          marginBottom: 14,
        }}
      >
        Bill: {fmt(data.amount)} · Paid: {fmt(data.paid)} ·{" "}
        <strong>Pending: {fmt(data.amount - data.paid)}</strong>
      </div>
      <Field label="Amount (₹) *">
        {" "}
        <input
          type="number"
          style={IS()}
          value={form?.payAmt ?? data.amount - data.paid}
          onChange={onChange("payAmt")}
        />
      </Field>
      <Field label="Payment Mode">
        <select
          style={IS()}
          value={form?.payMode ?? "Cash"}
          onChange={onChange("payMode")}
        >
          {payModes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          style={IS()}
          value={form?.payDate ?? today ?? ""}
          onChange={onChange("payDate")}
        />
      </Field>
      <Field label="Notes (optional)">
        <input
          style={IS()}
          value={form?.payNote ?? ""}
          onChange={onChange("payNote")}
          placeholder="Ref no., remarks…"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy
            ? "Recording..."
            : `Record ${form?.payAmt ? fmt(form.payAmt) : ""}`}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

export function BillDetailModal({ data, onClose, customers = [] }) {
  const customerName =
    customers.find((c) => c.id === data.custId)?.name || "Unknown Customer";
  return (
    <Modal title={"Bill — " + customerName} onClose={onClose}>
      {[
        ["Bill ID", data.id],
        ["Customer", customerName],
        ["Month", data.month],
        ["Amount", fmt(data.amount)],
        ["Paid", fmt(data.paid)],
        ["Pending", fmt(data.amount - data.paid)],
        ["Status", data.status],
        ["Due Date", data.due],
        ["Locked", data.locked ? "Yes" : "No"],
      ].map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "7px 0",
            borderBottom: "0.5px solid #f3f4f6",
            fontSize: 13,
          }}
        >
          <span style={{ color: "#6b7280" }}>{k}</span>
          <span style={{ fontWeight: 500, color: "#111" }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop: 14 }}>
        <Btn full variant="secondary" onClick={onClose}>
          Close
        </Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function AdjustmentModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  customers,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Add Adjustment" onClose={onClose}>
      {/* FIX DUPLICATION: Reused shared component */}
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
      />
      <Field label="Amount (₹, use – for deduction) *">
        <input
          type="number"
          style={IS()}
          value={form?.amount ?? ""}
          onChange={onChange("amount")}
          placeholder="-50 or 100"
        />
      </Field>
      <Field label="Reason *">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Half delivery, Quality issue…"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function PauseModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  customers,
}) {
  const [busy, save] = useBusy(onSave);

  // Client-side guard: backend rejects endDate < startDate but the user
  // shouldn't have to round-trip to find out.
  const start = form?.startDate || data?.startDate;
  const end = form?.endDate;
  const endError =
    end && start && end < start ? "End date can't be before start" : null;

  return (
    <Modal title="Add Pause Period" onClose={onClose}>
      {/* ✅ Start Date is correctly handled here by the shared component */}
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
        dateKey="startDate"
        dateLabel="Start Date *"
      />

      {/* ✅ End Date field with the typo fixed */}
      <Field label="End Date" error={endError}>
        <input
          type="date"
          value={form.endDate || ""}
          onChange={onChange("endDate")} // ✅ FIXED: Changed from onFieldChange to onChange
          min={form.startDate || ""}
          aria-invalid={!!endError}
          style={IS()}
        />
      </Field>

      <Field label="Reason">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Out of town, Travel…"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy || !!endError}>
          {busy ? "Saving..." : "Save"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function BrandModal({ form, onChange, onSave, onClose, milkTypes }) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Add Milk Brand" onClose={onClose}>
      <Field label="Brand Name *">
        <input
          style={IS()}
          value={form?.name ?? ""}
          onChange={onChange("name")}
          placeholder="Amul"
        />
      </Field>
      <Field label="Supplier Name">
        <input
          style={IS()}
          value={form?.supplier ?? ""}
          onChange={onChange("supplier")}
          placeholder="Amul Dairy Ltd."
        />
      </Field>
      <Field label="Supplier Phone">
        <input
          style={IS()}
          value={form?.phone ?? ""}
          onChange={onChange("phone")}
          placeholder="9000000001"
        />
      </Field>
      <Field label="Default Milk Type">
        <select
          style={IS()}
          value={form?.defaultType ?? ""}
          onChange={onChange("defaultType")}
        >
          <option value="">Select Type</option>
          {milkTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Rate per Litre (₹)">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.rate ?? ""}
          onChange={onChange("rate")}
          placeholder="36"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// ── SUBSCRIPTION MODALS ──────────────────────────────────────────────────────
const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// fallow-ignore-next-line complexity
export function SubscriptionModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  customers,
}) {
  const [busy, save] = useBusy(onSave);
  const currentDays = form?.deliveryDays || data?.deliveryDays || [];
  // fallow-ignore-next-line complexity
  const toggleDay = (day) => {
    const next = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    onChange("deliveryDays")(next);
  };

  return (
    <Modal
      title={data?.id ? "Edit Subscription" : "Add Subscription"}
      onClose={onClose}
    >
      <Field label="Customer *">
        <select
          style={IS()}
          value={form?.customerId ?? data?.customerId ?? ""}
          onChange={onChange("customerId")}
        >
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>

      <Field label="Milk Type *">
        <select
          style={IS()}
          value={form?.milkType ?? data?.milkType ?? "FULL_CREAM"}
          onChange={onChange("milkType")}
        >
          <option value="FULL_CREAM">Full Cream</option>
          <option value="SKIMMED">Skimmed</option>
          <option value="BUFFALO">Buffalo</option>
        </select>
      </Field>

      <Field label="Quantity (L) *">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.quantity ?? data?.quantity ?? 1}
          onChange={onChange("quantity")}
        />
      </Field>

      <Field label="Delivery Days *">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* fallow-ignore-next-line complexity */}
          {DAYS_OF_WEEK.map((d) => {
            const isSelected = currentDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: isSelected
                    ? "1px solid #1e40af"
                    : "1px solid #d1d5db",
                  background: isSelected ? "#dbeafe" : "#fff",
                  color: isSelected ? "#1e40af" : "#6b7280",
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Status">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={
              form?.isActive !== undefined
                ? form.isActive
                : data?.isActive !== undefined
                  ? data.isActive
                  : true
            }
            onChange={(e) => onChange("isActive")(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: "#111" }}>Active</span>
        </label>
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// ── SUBSCRIPTIONS LIST MODAL ─────────────────────────────────────────────────
export function SubscriptionsListModal({
  subscriptions,
  onEdit,
  onViewHistory,
  onClose,
}) {
  return (
    <Modal title="Manage Subscriptions" onClose={onClose} wide>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {subscriptions.length} subscription(s)
        </span>
        <Btn small onClick={() => onEdit(null)}>
          + Add Subscription
        </Btn>
        {/* ✅ STRAY BUTTON REMOVED FROM HERE */}
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {subscriptions.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            No subscriptions yet. Click "Add Subscription" to create one.
          </div>
        ) : (
          // fallow-ignore-next-line complexity
          subscriptions.map((sub) => (
            <div
              key={sub.id}
              style={{
                padding: "10px 0",
                borderBottom: "0.5px solid #f3f4f6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                  {sub.customerName || "Unknown Customer"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {sub.milkType} • {sub.quantity}L •{" "}
                  {sub.deliveryDays
                    .slice() // ✅ Added .slice() to prevent mutating the original array
                    .sort((a, b) => a - b)
                    .map(
                      (d) =>
                        DAYS_OF_WEEK.find((dw) => dw.value === d)?.label || d,
                    )
                    .join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: sub.isActive ? "#dcfce7" : "#f3f4f6",
                    color: sub.isActive ? "#166534" : "#6b7280",
                    fontWeight: 600,
                  }}
                >
                  {sub.isActive ? "Active" : "Paused"}
                </span>
                {/* ✅ THE CORRECT "History" BUTTON IS INSIDE THE MAP LOOP */}
                <Btn
                  small
                  variant="secondary"
                  onClick={() => onViewHistory(sub)}
                >
                  History
                </Btn>
                <Btn small variant="secondary" onClick={() => onEdit(sub)}>
                  Edit
                </Btn>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

// ── AD-HOC LOG MODAL ─────────────────────────────────────────────────────────
// fallow-ignore-next-line complexity
export function AdHocLogModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  customers,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Add Extra Delivery" onClose={onClose}>
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
      />
      <Field label="Quantity (L) *">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.qty ?? 1}
          onChange={onChange("qty")}
        />
      </Field>
      <Field label="Reason (Optional)">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Guests, Festival..."
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Adding..." : "Add Delivery"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// ── CREDIT NOTE MODAL ────────────────────────────────────────────────────────
// fallow-ignore-next-line complexity
export function CreditNoteModal({
  form,
  onChange,
  onSave,
  onClose,
  customers,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Issue Credit Note" onClose={onClose}>
      <Field label="Customer *">
        <select
          style={IS()}
          value={form?.customerId ?? ""}
          onChange={onChange("customerId")}
        >
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>
      <Field label="Amount (₹) *">
        <input
          type="number"
          style={IS()}
          value={form?.amount ?? ""}
          onChange={onChange("amount")}
          placeholder="50"
        />
      </Field>
      <Field label="Reason *">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Spoiled milk, Missed delivery..."
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Issuing..." : "Issue Credit"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}

// ── SUBSCRIPTION HISTORY MODAL ───────────────────────────────────────────────
// fallow-ignore-next-line complexity
export function SubscriptionHistoryModal({ data, onClose, handlers }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (data?.id && handlers?.fetchSubscriptionHistory) {
      handlers.fetchSubscriptionHistory(data.id).then((res) => {
        setHistory(res);
        setLoading(false);
      });
    }
  }, [data, handlers]);

  return (
    <Modal
      title={`History: ${data?.customerName || "Subscription"}`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
          Loading timeline...
        </div>
      ) : history.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
          No changes recorded yet.
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: "auto", padding: "0 8px" }}>
          // fallow-ignore-next-line complexity
          {history.map((item, idx) => (
            <div
              key={item.id}
              style={{ display: "flex", gap: 12, marginBottom: 16 }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background:
                      item.action === "CREATED" ? "#10b981" : "#3b82f6",
                  }}
                />
                {idx !== history.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      background: "#e5e7eb",
                      marginTop: 4,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: item.action === "CREATED" ? "#059669" : "#1e40af",
                  }}
                >
                  {item.action}
                </div>
                <div style={{ fontSize: 13, color: "#111", marginTop: 2 }}>
                  {item.details}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  {new Date(item.timestamp).toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
