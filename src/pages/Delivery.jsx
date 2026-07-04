// ── Delivery.jsx ──────────────────────────────────────────────────────────────
// Daily Delivery tab: pick a date, see scheduled + done counts, toggle each
// entry's delivered/skipped state.
import { useEffect } from "react";
import { useMemo } from "react";
import { useBusy } from "../hooks/useBusy.js";
import {
  Card,
  Field,
  IS,
  Section,
  StatGrid,
  Empty,
  Badge,
  Btn, 
} from "../components/ui.jsx";

function calculateDeliveryStats(todayLogs) {
  const delivered = todayLogs.filter((l) => l.delivered);
  return {
    scheduled: todayLogs.length,
    deliveredCount: delivered.length,
    skippedCount: todayLogs.filter((l) => !l.delivered).length,
    totalLiters: delivered.reduce((s, l) => s + l.qty, 0).toFixed(1) + " L",
  };
}

function getToggleButtonStyle(delivered) {
  return {
    background: delivered ? "#dcfce7" : "#fee2e2",
    border: "none",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    color: delivered ? "#166534" : "#991b1b",
  };
}

function getToggleButtonText(delivered) {
  return delivered ? "✓ Done" : "✗ Skip";
}

export default function Delivery({
  logDate,
  onLogDateChange,
  todayLogs,
  onToggleLog,
  fetchLogs,
  generateDailyLogs,
  onOpenModal,
  customers = [],
}) {
  // ✅ Create a fast lookup map for customers
  const customerMap = useMemo(() => {
    const map = {};
    customers.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [customers]);

  const stats = calculateDeliveryStats(todayLogs);

  // Re-fetch logs whenever the user picks a new date
  useEffect(() => {
    if (logDate && fetchLogs) {
      fetchLogs(logDate);
    }
  }, [logDate, fetchLogs]);

  // Wrap the generation function to track loading state and prevent double-clicks
  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  return (
    <div>
      <Section title="Daily Delivery Log" />

      {/* ── Date Picker & Generate Button Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 150 }}>
          <Field label="Select Date">
            <input
              type="date"
              value={logDate}
              onChange={(e) => onLogDateChange(e.target.value)}
              style={IS()}
            />
          </Field>
        </div>
        {/* 👇 WRAP THE BUTTONS IN A FLEX CONTAINER 👇 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        ></div>
        <Btn
          small
          onClick={handleGenerate}
          disabled={busy}
          style={{
            background: busy ? "#9ca3af" : "#059669", // Green to indicate creation
            color: "#fff",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4, // Align baseline with the input field
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "⏳ Generating..." : "⚡ Generate Deliveries"}
        </Btn>
        <Btn
          small
          variant="secondary"
          onClick={() => onOpenModal("addAdHoc")}
          style={{ whiteSpace: "nowrap" }}
        >
          + Extra Delivery
        </Btn>
      </div>

      <StatGrid
        items={[
          { label: "Scheduled", value: stats.scheduled, icon: "📋" },
          {
            label: "Delivered",
            value: stats.deliveredCount,
            icon: "✅",
            bg: "#dcfce7",
            tx: "#166534",
          },
          {
            label: "Skipped",
            value: stats.skippedCount,
            icon: "⏭️",
            bg: "#fee2e2",
            tx: "#991b1b",
          },
          { label: "Qty (L)", value: stats.totalLiters, icon: "🥛" },
        ]}
      />

      {todayLogs.length === 0 ? (
        <Empty msg="No deliveries scheduled for this date" />
      ) : (
        todayLogs.map((l) => (
          <Card key={l.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                {/* ✅ Resolved Customer Name */}
                <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>
                  {customerMap[l.custId]?.name || "Unknown Customer"}
                </div>
                {/* ✅ Resolved Product and Qty */}
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {l.product || customerMap[l.custId]?.product || "Milk"} · {l.qty}L
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>
                  {l.customer}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {l.product} · {l.qty}L
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge label={l.delivered ? "Delivered" : "Skipped"} />
                <button
                  onClick={() => onToggleLog(l.id, !l.delivered)}
                  style={getToggleButtonStyle(l.delivered)}
                >
                  {getToggleButtonText(l.delivered)}
                </button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
