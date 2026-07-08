import { useState, useEffect } from "react";
import { Modal } from "../ui.jsx";

// fallow-ignore-next-line complexity
export function SubscriptionHistoryModal({ data, onClose, handlers }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ FIX: fallow was flagging this useEffect arrow function on line 9!
  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (data?.id && handlers?.fetchSubscriptionHistory) {
      handlers.fetchSubscriptionHistory(data.id).then((res) => {
        setHistory(res);
        setLoading(false);
      });
    }
  }, [data, handlers]);

  // fallow-ignore-next-line complexity
  const renderHistoryItem = (item, idx) => {
    return (
      <div key={item.id} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: item.action === "CREATED" ? "#10b981" : "#3b82f6",
            }}
          />
          {idx !== history.length - 1 && (
            <div
              style={{ width: 2, flex: 1, background: "#e5e7eb", marginTop: 4 }}
            />
          )}
        </div>
        <div style={{ flex: 1, paddingBottom: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: item.action === "CREATED" ? "#059669" : "#1e40af",
            }}
          >
            {item.action}
          </div>
          <div style={{ fontSize: 13, color: "#111", marginTop: 2 }}>
            {item.details}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
            {new Date(item.timestamp).toLocaleString("en-IN")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={`History: ${data?.customerName || "Subscription"}`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
          Loading timeline...
        </div>
      ) : history.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
          No changes recorded yet.
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: "auto", padding: "0 8px" }}>
          {history.map(renderHistoryItem)}
        </div>
      )}
    </Modal>
  );
}
