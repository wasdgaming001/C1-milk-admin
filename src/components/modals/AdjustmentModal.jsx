import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { CustomerDateFields } from "./shared.js";

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
