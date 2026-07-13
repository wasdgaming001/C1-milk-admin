import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const SC = {
  Active: { bg: "#dcfce7", tx: "#166534" }, Paused: { bg: "#fef9c3", tx: "#854d0e" }, Inactive: { bg: "#f3f4f6", tx: "#374151" },
  Paid: { bg: "#dcfce7", tx: "#166534" }, Unpaid: { bg: "#fee2e2", tx: "#991b1b" }, Partial: { bg: "#fef9c3", tx: "#854d0e" },
  Draft: { bg: "#f3f4f6", tx: "#374151" }, Confirmed: { bg: "#dbeafe", tx: "#1e40af" }, Reconciled: { bg: "#e0e7ff", tx: "#3730a3" },
  Delivered: { bg: "#dcfce7", tx: "#166534" }, Skipped: { bg: "#fee2e2", tx: "#991b1b" }, 
  Applied: { bg: "#dbeafe", tx: "#1e40af" }, Pending: { bg: "#fef9c3", tx: "#854d0e" },
};

export function Badge({ label }) {
  const c = SC[label] || { bg: "#f3f4f6", tx: "#374151" };
  return (
    <span className="badge" style={{ background: c.bg, color: c.tx }}>
      {label}
    </span>
  );
}

export function Toast({ msg, type, onClose }) {
  const bg =
    type === "success"
      ? "#166534"
      : type === "error"
        ? "#991b1b"
        : type === "warning"
          ? "#854d0e"
          : "#1e40af";
  return (
    <div className="toast" style={{ background: bg }}>
      {msg}
      <button
        className="close-btn"
        onClick={onClose}
        style={{ color: "white" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Btn({
  onClick,
  children,
  variant = "primary",
  small,
  full,
  disabled,
  style,
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${small ? "btn-sm" : "btn-md"} ${full ? "btn-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, className, error }) {
  return (
    <div className={`field ${className || ""}`}>
      {label && <label className="field-label">{label}</label>}
      {children}
      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
export function Card({ children, style }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      {title && <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>}
      {action || children}
    </div>
  );
}

export function Empty({ msg, message }) { 
  return <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>{msg || message}</div>; 
}

export function Section({ title, action }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
      {action}
    </div>
  );
}

export function StatGrid({ items, stats }) {
  const data = items || stats || [];
  return (
    <div className="stat-grid">
      {data.map((i, idx) => (
        <div key={idx} className="stat-tile" style={{ background: i.bg, color: i.tx }}>
          <div className="stat-label">{i.icon} {i.label}</div>
          <div className="stat-value" style={{ color: i.tx || "var(--text-primary)" }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ActiveBrandOptions({ brands }) {
  return brands
    .filter((b) => b.status === "Active")
    .map((b) => (
      <option key={b.id} value={b.name}>
        {b.name}
      </option>
    ));
}

export function ActiveCustomerOptions({ customers }) {
  return customers
    .filter((c) => c.status === "Active")
    .map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
      </option>
    ));
}

// Backward-compatible inline style for inputs in modals
export const IS = (extra = {}) => ({
  width: "100%",
  padding: "10px 14px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 14,
  color: "#0f172a",
  transition: "all 0.2s ease",
  outline: "none",
  ...extra,
});
