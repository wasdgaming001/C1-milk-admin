import { useState, useEffect } from "react";
import {
  Home,
  Users,
  Truck,
  Milk,
  Receipt,
  MoreHorizontal,
  LogOut,
  Wifi,
  Moon, 
  Sun,
} from "lucide-react";

const TABS = [
  { id: "dashboard", icon: Home, label: "Home" },
  { id: "customers", icon: Users, label: "Customers" },
  { id: "delivery", icon: Truck, label: "Delivery" },
  { id: "imports", icon: Milk, label: "Imports" },
  { id: "billing", icon: Receipt, label: "Billing" },
  { id: "more", icon: MoreHorizontal, label: "More" },
];

const TAB_TITLES = {
  dashboard: "Dashboard",
  customers: "Customers",
  delivery: "Daily Delivery",
  imports: "Milk Imports",
  billing: "Billing",
  more: "More",
};

function TabButton({ tab, active, onSelect }) {
  const isActive = tab.id === active;
  const Icon = tab.icon;
  return (
    <button
      className={`nav-item ${isActive ? "active" : ""}`}
      onClick={() => onSelect(tab.id)}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      <span>{tab.label}</span>
    </button>
  );
}

export function AppShell({
  tab,
  today,
  onTabChange,
  onLogout,
  loadErrors = [],
  onRefresh,
  children,
  footer,
}) {
    const [darkMode, setDarkMode] = useState(() => 
    localStorage.getItem('darkMode') === 'true'
  );

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      {loadErrors.length > 0 && (
        <div
          style={{
            background: "#fef2f2",
            color: "#dc2626",
            padding: "12px 24px",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠ Failed to load: {loadErrors.join(", ")}</span>
          <button
            onClick={onRefresh}
            style={{
              background: "none",
              border: "none",
              color: "#dc2626",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <header className="app-header">
        <div>
          <h1>Milk Delivery Admin</h1>
          <h2>{TAB_TITLES[tab]}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center"
            }}
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <Wifi size={14} color="#16a34a" />
            <span>{today}</span>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <LogOut size={14} /> SIGN OUT
            </button>
          )}
        </div>
      </header>

      <main
        style={{
          flex: 1,
          padding: "24px",
          maxWidth: 1024,
          margin: "0 auto",
          width: "100%",
          paddingBottom: 100,
        }}
      >
        {children}
      </main>

      {footer}

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <TabButton key={t.id} tab={t} active={tab} onSelect={onTabChange} />
        ))}
      </nav>
    </div>
  );
}
