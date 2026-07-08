import { Modal, Btn } from "../ui.jsx";
import { DAYS_OF_WEEK } from "./shared.js";

// fallow-ignore-next-line complexity
export function SubscriptionsListModal({
  subscriptions,
  onEdit,
  onViewHistory,
  onClose,
}) {
  return (
    <Modal title="Manage Subscriptions" onClose={onClose} wide>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {subscriptions.length} subscription(s)
        </span>
        <Btn small onClick={() => onEdit(null)}>
          + Add Subscription
        </Btn>
      </div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {subscriptions.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            No subscriptions yet. Click "Add Subscription" to create one.
          </div>
        ) : (
          // fallow-ignore-next-line complexity
          subscriptions.map((sub) => (
            <div
              key={sub.id}
              style={{
                padding: "10px 0",
                borderBottom: "0.5px solid #f3f4f6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                  {sub.customerName || "Unknown Customer"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {sub.milkType} • {sub.quantity}L •{" "}
                  {sub.deliveryDays
                    .slice()
                    .sort((a, b) => a - b)
                    .map(
                      (d) =>
                        DAYS_OF_WEEK.find((dw) => dw.value === d)?.label || d,
                    )
                    .join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: sub.isActive ? "#dcfce7" : "#f3f4f6",
                    color: sub.isActive ? "#166534" : "#6b7280",
                    fontWeight: 600,
                  }}
                >
                  {sub.isActive ? "Active" : "Paused"}
                </span>
                <Btn
                  small
                  variant="secondary"
                  onClick={() => onViewHistory(sub)}
                >
                  History
                </Btn>
                <Btn small variant="secondary" onClick={() => onEdit(sub)}>
                  Edit
                </Btn>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
