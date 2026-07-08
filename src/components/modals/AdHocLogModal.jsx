import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { CustomerDateFields } from "./shared.js";

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
