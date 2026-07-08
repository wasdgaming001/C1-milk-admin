import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { CustomerDateFields } from "./shared.js";

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
  const start = form?.startDate || data?.startDate;
  const end = form?.endDate;
  const endError =
    end && start && end < start ? "End date can't be before start" : null;

  return (
    <Modal title="Add Pause Period" onClose={onClose}>
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
        dateKey="startDate"
        dateLabel="Start Date *"
      />
      <Field label="End Date" error={endError}>
        <input
          type="date"
          value={form.endDate || ""}
          onChange={onChange("endDate")}
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
