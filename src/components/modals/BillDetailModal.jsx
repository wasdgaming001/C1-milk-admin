import { Modal, Btn } from "../ui.jsx";
import { fmt } from "../../lib/utils.js";

// fallow-ignore-next-line complexity
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
