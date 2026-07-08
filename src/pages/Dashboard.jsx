import { Card, StatGrid, Btn, Section, Empty, Badge } from "../components/ui.jsx";
import { UserPlus, Package, Receipt, Scale, PauseCircle, Tag, ArrowRight, Calendar, CheckCircle, XCircle, Droplet } from "lucide-react";
import { fmt } from "../lib/utils.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const QUICK_ACTIONS = [
  { label: "Add Customer", icon: UserPlus, type: "addCustomer" },
  { label: "Add Import", icon: Package, type: "addImport" },
  { label: "Generate Bills", icon: Receipt, action: "generate" },
  { label: "Adjustment", icon: Scale, type: "addAdj" },
  { label: "Add Pause", icon: PauseCircle, type: "addPause" },
  { label: "Add Brand", icon: Tag, type: "addBrand" },
];

// fallow-ignore-next-line complexity
function monthLabel(YYYYMM) {
  if (!YYYYMM || typeof YYYYMM !== "string" || YYYYMM.length < 7) return YYYYMM;
  const monthIdx = Number(YYYYMM.substring(5, 7)) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return YYYYMM;
  return MONTH_NAMES[monthIdx];
}

export default function Dashboard({ today, todayLogs = [], bills = [], customers = [], onSetTab, onOpenModal, onGenerateBill }) {
  const customerName = (() => {
    const m = new Map();
    for (const c of customers) m.set(c.id, c.name);
    return (id) => m.get(id) || "Unknown Customer";
  })();

  const deliveredCount = todayLogs.filter((l) => l.delivered).length;
  const skippedCount = todayLogs.filter((l) => !l.delivered).length;
  const totalLiters = todayLogs.filter((l) => l.delivered).reduce((s, l) => s + l.qty, 0).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section title={`Today's Delivery — ${today}`} action={
        <Btn variant="secondary" small onClick={() => onSetTab("delivery")}>View Log <ArrowRight size={14} /></Btn>
      } />
      
      <StatGrid items={[
        { label: "Scheduled", value: todayLogs.length, icon: <Calendar size={14} /> },
        { label: "Delivered", value: deliveredCount, icon: <CheckCircle size={14} color="#16a34a" /> },
        { label: "Skipped", value: skippedCount, icon: <XCircle size={14} color="#dc2626" /> },
        { label: "Total (L)", value: `${totalLiters} L`, icon: <Droplet size={14} color="#2563eb" /> },
      ]} />

      <div>
        <Section title="Quick Actions" />
        <div className="quick-actions">
          {QUICK_ACTIONS.map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.label} className="quick-action-btn" onClick={() => q.action === "generate" ? onGenerateBill() : onOpenModal(q.type)}>
                <Icon size={20} />
                <span>{q.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Section title="Recent Bills" action={
          <button className="btn-ghost btn-sm" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--brand-600)", fontSize: 13, fontWeight: 500 }} onClick={() => onSetTab("billing")}>
            View all <ArrowRight size={14} />
          </button>
        } />
        <Card>
          {bills.slice(0, 3).length === 0 ? (
            <Empty msg="No recent bills" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bills.slice(0, 3).map((b) => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-color)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{customerName(b.custId)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{monthLabel(b.month)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{fmt(b.amount)}</span>
                    <Badge label={b.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}