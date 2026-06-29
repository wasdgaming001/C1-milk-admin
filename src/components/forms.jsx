// ── forms.jsx ─────────────────────────────────────────────────────────────────
import { fmt } from "../lib/utils.js";
import { BLUE_L, BLUE } from "../lib/constants.js";
import {
  Modal, Field, Btn, IS,
  ActiveBrandOptions, ActiveCustomerOptions,
} from "./ui.jsx";

// ── Shared Components to eliminate duplication ────────────────────────────────
// fallow-ignore-next-line complexity
function CustomerDateFields({ form, data, today, customers, onChange, dateKey = "date", dateLabel = "Date *" }) {
  return (
    <>
      <Field label="Customer *">
        <select style={IS()} value={form?.custId ?? data?.custId ?? ""} onChange={onChange("custId")}>
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>
      <Field label={dateLabel}><input type="date" style={IS()} value={form?.[dateKey] ?? today ?? ""} onChange={onChange(dateKey)} /></Field>
    </>
  );
}

// fallow-ignore-next-line complexity
function calculateImportTotal(form, data) {
  const qty = parseFloat(form?.qty ?? data?.qty ?? 0) || 0;
  const rate = parseFloat(form?.rate ?? data?.rate ?? 0) || 0;
  return Math.round(qty * rate * 100) / 100;
}

function getCustomerModalTitle(isEdit) { return isEdit ? "Edit Customer" : "Add Customer"; }
function getCustomerModalButtonText(isEdit) { return isEdit ? "Update" : "Save"; }

// fallow-ignore-next-line complexity
export function CustomerModal({ data, form, isEdit, onChange, onSave, onClose, products }) {
  return (
    <Modal title={getCustomerModalTitle(isEdit)} onClose={onClose}>
      <Field label="Full Name *"><input style={IS()} value={form?.name ?? data?.name ?? ""} onChange={onChange("name")} placeholder="Ramesh Sharma" /></Field>
      <Field label="Delivery Address *"><input style={IS()} value={form?.address ?? data?.address ?? ""} onChange={onChange("address")} placeholder="14, Shivaji Nagar" /></Field>
      <Field label="Phone (10 digits)"><input style={IS()} value={form?.phone ?? data?.phone ?? ""} onChange={onChange("phone")} placeholder="9876543210" /></Field>
      <Field label="Product">
        <select style={IS()} value={form?.product ?? data?.product ?? "Full Cream"} onChange={onChange("product")}>
          {products.map(p => <option key={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Daily Qty (L)"><input type="number" step="0.5" style={IS()} value={form?.qty ?? data?.qty ?? 1} onChange={onChange("qty")} /></Field>
      <div style={{ display:"flex", gap:8, marginTop:4 }}>
        <Btn onClick={onSave}>{getCustomerModalButtonText(isEdit)}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
function ImportDateField({ data, form, today, onChange }) {
  return (<Field label="Date *"><input type="date" style={IS()} value={form?.date ?? data?.date ?? today ?? ""} onChange={onChange("date")} /></Field>);
}

// fallow-ignore-next-line complexity
function ImportBrandField({ data, form, brands, onChange }) {
  return (
    <Field label="Brand *">
      <select style={IS()} value={form?.brand ?? data?.brand ?? ""} onChange={onChange("brand")}>
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
      <select style={IS()} value={form?.type ?? data?.type ?? ""} onChange={onChange("type")}>
        <option value="">Select Type</option>
        {milkTypes.map(t => <option key={t}>{t}</option>)}
      </select>
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportQtyRateField({ data, form, onChange }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      <Field label="Qty (L) *"><input type="number" style={IS()} value={form?.qty ?? data?.qty ?? ""} onChange={onChange("qty")} placeholder="100" /></Field>
      <Field label="Rate (₹/L) *"><input type="number" step="0.5" style={IS()} value={form?.rate ?? data?.rate ?? ""} onChange={onChange("rate")} placeholder="36" /></Field>
    </div>
  );
}

// fallow-ignore-next-line complexity
function ImportMetaFields({ data, form, onChange }) {
  return (
    <>
      <Field label="Invoice No."><input style={IS()} value={form?.invoice ?? data?.invoice ?? ""} onChange={onChange("invoice")} placeholder="INV-2025-001" /></Field>
      <Field label="Supplier"><input style={IS()} value={form?.supplier ?? data?.supplier ?? ""} onChange={onChange("supplier")} /></Field>
      <Field label="Notes"><input style={IS()} value={form?.notes ?? data?.notes ?? ""} onChange={onChange("notes")} /></Field>
    </>
  );
}

function ImportTotalDisplay({ total }) {
  return (
    <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#166534", marginBottom:12 }}>
      Total: {fmt(total)}
    </div>
  );
}

// fallow-ignore-next-line complexity
export function ImportModal({ data, form, onChange, onSave, onClose, today, brands, milkTypes }) {
  const total = calculateImportTotal(form, data);
  return (
    <Modal title={data.id ? "Edit Import" : "Add Milk Import"} onClose={onClose}>
      <ImportDateField data={data} form={form} today={today} onChange={onChange} />
      <ImportBrandField data={data} form={form} brands={brands} onChange={onChange} />
      <ImportTypeField data={data} form={form} milkTypes={milkTypes} onChange={onChange} />
      <ImportQtyRateField data={data} form={form} onChange={onChange} />
      <ImportMetaFields data={data} form={form} onChange={onChange} />
      <ImportTotalDisplay total={total} />
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={onSave}>{data.id ? "Update" : "Save Draft"}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function PaymentModal({ data, form, onChange, onSave, onClose, today, payModes }) {
  return (
    <Modal title={"Record Payment — " + data.customer} onClose={onClose}>
      <div style={{ background:BLUE_L, borderRadius:8, padding:"10px 12px", fontSize:13, color:BLUE, marginBottom:14 }}>
        Bill: {fmt(data.amount)} · Paid: {fmt(data.paid)} · <strong>Pending: {fmt(data.amount - data.paid)}</strong>
      </div>
      <Field label="Amount (₹) *"><input type="number" style={IS()} value={form?.payAmt ?? (data.amount - data.paid) ?? ""} onChange={onChange("payAmt")} /></Field>
      <Field label="Payment Mode">
        <select style={IS()} value={form?.payMode ?? "Cash"} onChange={onChange("payMode")}>
          {payModes.map(m => <option key={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" style={IS()} value={form?.payDate ?? today ?? ""} onChange={onChange("payDate")} /></Field>
      <Field label="Notes (optional)"><input style={IS()} value={form?.payNote ?? ""} onChange={onChange("payNote")} placeholder="Ref no., remarks…" /></Field>
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={onSave}>Record {form?.payAmt ? fmt(form.payAmt) : ""}</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

export function BillDetailModal({ data, onClose }) {
  return (
    <Modal title={"Bill — " + data.customer} onClose={onClose}>
      {[
        ["Bill ID", data.id], ["Customer", data.customer], ["Month", data.month],
        ["Amount", fmt(data.amount)], ["Paid", fmt(data.paid)], ["Pending", fmt(data.amount - data.paid)],
        ["Status", data.status], ["Due Date", data.due], ["Locked", data.locked ? "Yes" : "No"],
      ].map(([k, v]) => (
        <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f3f4f6", fontSize:13 }}>
          <span style={{ color:"#6b7280" }}>{k}</span><span style={{ fontWeight:500, color:"#111" }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop:14 }}><Btn full variant="secondary" onClick={onClose}>Close</Btn></div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function AdjustmentModal({ data, form, onChange, onSave, onClose, today, customers }) {
  return (
    <Modal title="Add Adjustment" onClose={onClose}>
      {/* FIX DUPLICATION: Reused shared component */}
      <CustomerDateFields form={form} data={data} today={today} customers={customers} onChange={onChange} />
      <Field label="Amount (₹, use – for deduction) *"><input type="number" style={IS()} value={form?.amount ?? ""} onChange={onChange("amount")} placeholder="-50 or 100" /></Field>
      <Field label="Reason *"><input style={IS()} value={form?.reason ?? ""} onChange={onChange("reason")} placeholder="Half delivery, Quality issue…" /></Field>
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={onSave}>Save</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function PauseModal({ data, form, onChange, onSave, onClose, today, customers }) {
  return (
    <Modal title="Add Pause Period" onClose={onClose}>
      {/* FIX DUPLICATION: Reused shared component */}
      <CustomerDateFields form={form} data={data} today={today} customers={customers} onChange={onChange} dateKey="startDate" dateLabel="Start Date *" />
      <Field label="End Date *"><input type="date" style={IS()} value={form?.endDate ?? ""} onChange={onChange("endDate")} /></Field>
      <Field label="Reason"><input style={IS()} value={form?.reason ?? ""} onChange={onChange("reason")} placeholder="Out of town, Travel…" /></Field>
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={onSave}>Save</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}

// fallow-ignore-next-line complexity
export function BrandModal({ form, onChange, onSave, onClose, milkTypes }) {
  return (
    <Modal title="Add Milk Brand" onClose={onClose}>
      <Field label="Brand Name *"><input style={IS()} value={form?.name ?? ""} onChange={onChange("name")} placeholder="Amul" /></Field>
      <Field label="Supplier Name"><input style={IS()} value={form?.supplier ?? ""} onChange={onChange("supplier")} placeholder="Amul Dairy Ltd." /></Field>
      <Field label="Supplier Phone"><input style={IS()} value={form?.phone ?? ""} onChange={onChange("phone")} placeholder="9000000001" /></Field>
      <Field label="Default Milk Type">
        <select style={IS()} value={form?.defaultType ?? ""} onChange={onChange("defaultType")}>
          <option value="">Select Type</option>
          {milkTypes.map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Rate per Litre (₹)"><input type="number" step="0.5" style={IS()} value={form?.rate ?? ""} onChange={onChange("rate")} placeholder="36" /></Field>
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={onSave}>Save</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
      </div>
    </Modal>
  );
}