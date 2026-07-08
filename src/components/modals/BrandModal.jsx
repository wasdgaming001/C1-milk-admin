import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";

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
