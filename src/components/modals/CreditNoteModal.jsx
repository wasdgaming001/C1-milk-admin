import { Field, Modal, Btn, IS, ActiveCustomerOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";

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
