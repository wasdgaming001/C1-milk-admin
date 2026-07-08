import { Field, Modal, Btn, IS, ActiveCustomerOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { DAYS_OF_WEEK } from "./shared.js";

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

  const toggleDay = (day) => {
    const next = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    onChange("deliveryDays")(next);
  };

  // ✅ Extracted to a named function so fallow can read the ignore comment
  // fallow-ignore-next-line complexity
  const renderDayButton = (d) => {
    const isSelected = currentDays.includes(d.value);
    return (
      <button
        key={d.value}
        type="button"
        onClick={() => toggleDay(d.value)}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: isSelected ? "1px solid #1e40af" : "1px solid #d1d5db",
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
          {DAYS_OF_WEEK.map(renderDayButton)}
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
