import { Field, Modal, Btn, IS, ActiveBrandOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { fmt } from "../../lib/utils.js";

// fallow-ignore-next-line complexity
function calculateImportTotal(form, data) {
  const qty = parseFloat(form?.qty ?? data?.qty ?? 0) || 0;
  const rate = parseFloat(form?.rate ?? data?.rate ?? 0) || 0;
  return Math.round(qty * rate * 100) / 100;
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

// fallow-ignore-next-line complexity
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
