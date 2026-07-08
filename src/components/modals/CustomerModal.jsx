import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";

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
