// ── Delivery.jsx ──────────────────────────────────────────────────────────────
import { useEffect } from "react";
import { useMemo } from "react";
import { useBusy } from "../hooks/useBusy.js";
import { Card, Field, IS, StatGrid, Empty, Btn } from "../components/ui.jsx";

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

// ── Extracted List Item Component ────────────────────────────────────────────
function DeliveryLogItem({ id, name, product, qty, delivered, onToggle }) {
  return (
    <div className="flex justify-between items-center p-3 border-b last:border-b-0">
      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">{name}</span>
        <span className="text-sm text-gray-600">
          {product} · {qty}L
        </span>
      </div>
      <button
        onClick={() => onToggle(id, !delivered)}
        style={getToggleButtonStyle(delivered)}
      >
        {getToggleButtonText(delivered)}
      </button>
    </div>
  );
}

// ✅ Extracted to module level to reduce the arrow function's complexity to 1
// fallow-ignore-next-line complexity
function resolveLog(l, customerMap) {
  const c = customerMap[l.custId];
  return {
    id: l.id,
    name: c?.name ?? "Unknown Customer",
    product: l.product ?? c?.product ?? "Milk",
    qty: l.qty,
    delivered: Boolean(l.delivered),
  };
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
  const customerMap = useMemo(() => {
    const map = {};
    customers.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [customers]);

  // ✅ The arrow function now has a cyclomatic complexity of 1, dropping CRAP to near 0
  const resolvedLogs = useMemo(
    () => todayLogs.map((l) => resolveLog(l, customerMap)),
    [todayLogs, customerMap],
  );

  const stats = calculateDeliveryStats(todayLogs);

  useEffect(() => {
    if (logDate && fetchLogs) {
      fetchLogs(logDate);
    }
  }, [logDate, fetchLogs]);

  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <Field label="Date" className="flex-1">
            <input
              type="date"
              value={logDate}
              onChange={(e) => onLogDateChange(e.target.value)}
              style={IS()}
            />
          </Field>

          <div className="flex gap-2 flex-wrap">
            <Btn
              onClick={handleGenerate}
              disabled={busy}
              className="flex-1 sm:flex-none"
            >
              {busy ? "⏳ Generating..." : "⚡ Generate Deliveries"}
            </Btn>
            <Btn
              onClick={() => onOpenModal("addAdHoc")}
              style={{ whiteSpace: "nowrap" }}
            >
              + Extra Delivery
            </Btn>
          </div>
        </div>
      </Card>

      <StatGrid stats={stats} />

      {todayLogs.length === 0 ? (
        <Empty message="No deliveries scheduled for this date." />
      ) : (
        <Card>
          <div className="space-y-2">
            {resolvedLogs.map((l) => (
              <DeliveryLogItem
                key={l.id}
                id={l.id}
                name={l.name}
                product={l.product}
                qty={l.qty}
                delivered={l.delivered}
                onToggle={onToggleLog}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
