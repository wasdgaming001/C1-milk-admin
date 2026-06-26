import { useState, useMemo, useEffect, useRef, useCallback } from "react";

const BLUE = "#1e40af";
const BLUE_L = "#dbeafe";
const BLUE_M = "#3b82f6";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = n => {
  const num = Number(n);
  if (n === undefined || n === null || isNaN(num)) return "₹0.00";
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const getToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Per-product rate (₹/L)
const RATE_BY_PRODUCT = { "Full Cream": 36, "Toned": 32, "Double Toned": 30, "Skimmed": 28, "Standardised": 34 };
let _uuidCounter = 0;
const uuid = () => {
  _uuidCounter += 1;
  return Date.now().toString(36).toUpperCase().slice(-4) + "-" + _uuidCounter.toString(36).toUpperCase().padStart(4, "0");
};
const cleanPhone = p => String(p || "").replace(/\D/g, "");
const monthLabel = ym => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return MONTHS[Number(m) - 1] + " " + y;
};
const daysInMonth = ym => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

// ── seed data ─────────────────────────────────────────────────────────────────
const seedCustomers = [
  { id:"C001", name:"Ramesh Sharma",    address:"14, Shivaji Nagar",  phone:"9876543210", status:"Active",   product:"Full Cream",   qty:2,   deliveryDays:[1,2,3,4,5,6,0], balance:-320 },
  { id:"C002", name:"Priya Mehta",      address:"7B, Patel Colony",   phone:"9988776655", status:"Active",   product:"Toned",         qty:1,   deliveryDays:[1,2,3,4,5,6,0], balance:-960 },
  { id:"C003", name:"Suresh Patel",     address:"3, Gandhi Road",     phone:"9012345678", status:"Paused",   product:"Double Toned",  qty:1.5, deliveryDays:[1,2,3,4,5],     balance:0 },
  { id:"C004", name:"Anita Desai",      address:"22, MG Colony",      phone:"8765432109", status:"Active",   product:"Full Cream",    qty:2,   deliveryDays:[1,2,3,4,5,6,0], balance:-2160 },
  { id:"C005", name:"Vijay Kumar",      address:"9, Nehru Street",    phone:"7654321098", status:"Active",   product:"Toned",         qty:1,   deliveryDays:[1,2,3,4,5,6,0], balance:0 },
  { id:"C006", name:"Kavita Joshi",     address:"5, Tilak Nagar",     phone:"9123456780", status:"Inactive", product:"Full Cream",    qty:0,   deliveryDays:[],               balance:0 },
  { id:"C007", name:"Deepak Agarwal",   address:"11, Civil Lines",    phone:"9871234560", status:"Active",   product:"Toned",         qty:1.5, deliveryDays:[1,2,3,4,5,6,0], balance:-1440 },
  { id:"C008", name:"Sunita Yadav",     address:"33, Rajiv Nagar",    phone:"9090909090", status:"Active",   product:"Full Cream",    qty:1,   deliveryDays:[1,2,3,4,5,6,0], balance:-960 },
];

const seedImports = [
  { id:"IMP001", date:"2025-01-18", brand:"Amul",         type:"Full Cream",   qty:120, rate:36,   total:4320, invoice:"INV-2025-001", status:"Confirmed", version:1 },
  { id:"IMP002", date:"2025-01-17", brand:"Mother Dairy", type:"Toned",        qty:80,  rate:32,   total:2560, invoice:"INV-2025-002", status:"Confirmed", version:1 },
  { id:"IMP003", date:"2025-01-16", brand:"Amul",         type:"Double Toned", qty:60,  rate:30,   total:1800, invoice:"",            status:"Draft",     version:1 },
  { id:"IMP004", date:"2025-01-15", brand:"Nandini",      type:"Full Cream",   qty:100, rate:35,   total:3500, invoice:"INV-2025-004", status:"Confirmed", version:1 },
  { id:"IMP005", date:"2025-01-10", brand:"Mother Dairy", type:"Toned",        qty:90,  rate:31.5, total:2835, invoice:"INV-2025-005", status:"Confirmed", version:1 },
];

const seedBills = [
  { id:"BL001", custId:"C001", customer:"Ramesh Sharma",  month:"Jan 2025", amount:2160, paid:2160, status:"Paid",    due:"2025-02-05", locked:false },
  { id:"BL002", custId:"C002", customer:"Priya Mehta",    month:"Jan 2025", amount:960,  paid:0,    status:"Unpaid",  due:"2025-02-05", locked:false },
  { id:"BL003", custId:"C003", customer:"Suresh Patel",   month:"Dec 2024", amount:1440, paid:1000, status:"Partial", due:"2025-01-05", locked:false },
  { id:"BL004", custId:"C004", customer:"Anita Desai",    month:"Jan 2025", amount:2160, paid:0,    status:"Unpaid",  due:"2025-02-05", locked:false },
  { id:"BL005", custId:"C005", customer:"Vijay Kumar",    month:"Jan 2025", amount:960,  paid:960,  status:"Paid",    due:"2025-02-05", locked:true  },
  { id:"BL006", custId:"C007", customer:"Deepak Agarwal", month:"Jan 2025", amount:1440, paid:0,    status:"Unpaid",  due:"2025-02-05", locked:false },
  { id:"BL007", custId:"C008", customer:"Sunita Yadav",   month:"Jan 2025", amount:960,  paid:500,  status:"Partial", due:"2025-02-05", locked:false },
];

const buildLogs = () => {
  const logs = [];
  const active = seedCustomers.filter(c => c.status === "Active");
  const total = daysInMonth("2025-01");
  for (let d = 1; d <= total; d++) {
    const dateStr = `2025-01-${String(d).padStart(2,"0")}`;
    const dow = new Date(dateStr).getDay();
    active.forEach(c => {
      if (!c.deliveryDays.includes(dow)) return;
      logs.push({ id: uuid(), custId: c.id, customer: c.name, date: dateStr, product: c.product, qty: c.qty, delivered: true, note:"" });
    });
  }
  return logs;
};

const seedLogs = buildLogs();

const seedAdjustments = [
  { id:"ADJ001", custId:"C001", customer:"Ramesh Sharma", date:"2025-01-05", amount:-50,  reason:"Half delivery",   applied:true  },
  { id:"ADJ002", custId:"C002", customer:"Priya Mehta",   date:"2025-01-12", amount:100,  reason:"Extra delivery",  applied:false },
  { id:"ADJ003", custId:"C004", customer:"Anita Desai",   date:"2025-01-08", amount:-30,  reason:"Quality issue",   applied:false },
];

const seedPauses = [
  { id:"P001", custId:"C003", customer:"Suresh Patel", startDate:"2025-01-10", endDate:"2025-01-25", reason:"Out of town" },
];

const seedBrands = [
  { id:"BR001", name:"Amul",         supplier:"Amul Dairy",        phone:"9000000001", status:"Active" },
  { id:"BR002", name:"Mother Dairy", supplier:"Mother Dairy India", phone:"9000000002", status:"Active" },
  { id:"BR003", name:"Nandini",      supplier:"KMF",               phone:"9000000003", status:"Active" },
  { id:"BR004", name:"Parag",        supplier:"Parag Milk Foods",  phone:"9000000004", status:"Inactive" },
];

const MILK_TYPES = ["Full Cream","Toned","Double Toned","Skimmed","Standardised"];
const PAY_MODES = ["Cash","UPI","PhonePe","GPay","Paytm","Bank Transfer","Cheque"];
const PRODUCTS = ["Full Cream","Toned","Double Toned","Skimmed","Standardised"];

// ── tiny UI components ────────────────────────────────────────────────────────
const SC = {
  Active:    { bg:"#dcfce7", tx:"#166534" },
  Paused:    { bg:"#fef9c3", tx:"#854d0e" },
  Inactive:  { bg:"#fee2e2", tx:"#991b1b" },
  Confirmed: { bg:"#dcfce7", tx:"#166534" },
  Reconciled:{ bg:"#e0f2fe", tx:"#075985" },
  Draft:     { bg:"#dbeafe", tx:"#1e40af" },
  Paid:      { bg:"#dcfce7", tx:"#166534" },
  Partial:   { bg:"#fef9c3", tx:"#854d0e" },
  Unpaid:    { bg:"#fee2e2", tx:"#991b1b" },
  pending:   { bg:"#dbeafe", tx:"#1e40af" },
  failed:    { bg:"#fef9c3", tx:"#854d0e" },
  dead:      { bg:"#fee2e2", tx:"#991b1b" },
  Applied:   { bg:"#dcfce7", tx:"#166534" },
  Pending:   { bg:"#fef9c3", tx:"#854d0e" },
  Delivered: { bg:"#dcfce7", tx:"#166534" },
  Skipped:   { bg:"#fee2e2", tx:"#991b1b" },
};

function Badge({ label }) {
  const c = SC[label] || { bg:"#f3f4f6", tx:"#374151" };
  return <span style={{ background:c.bg, color:c.tx, fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:99, whiteSpace:"nowrap" }}>{label}</span>;
}

function Toast({ msg, type, onClose }) {
  const bg = type==="success" ? "#166534" : type==="error" ? "#991b1b" : type==="warning" ? "#854d0e" : "#1e40af";
  return (
    <div style={{ position:"fixed", bottom:72, left:"50%", transform:"translateX(-50%)", background:bg, color:"#fff", padding:"10px 18px", borderRadius:10, fontSize:13, zIndex:9999, maxWidth:320, textAlign:"center" }}>
      {msg}
      <button onClick={onClose} style={{ marginLeft:8, background:"none", border:"none", color:"#fff", cursor:"pointer" }}>✕</button>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:800, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", width:"100%", maxWidth: wide ? 460 : 420, maxHeight:"88vh", overflowY:"auto", borderRadius:"16px 16px 0 0", padding:20, boxSizing:"border-box" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <span style={{ fontWeight:600, fontSize:15, color:"#111" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#6b7280" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const IS = (extra={}) => ({ width:"100%", padding:"8px 10px", border:"1px solid #d1d5db", borderRadius:8, fontSize:13, boxSizing:"border-box", color:"#111", background:"#fff", ...extra });

function Btn({ onClick, children, variant="primary", small, full, disabled, style }) {
  const base = {
    primary:   { background:BLUE, color:"#fff", border:"none" },
    secondary: { background:"#f3f4f6", color:"#374151", border:"1px solid #d1d5db" },
    danger:    { background:"#fee2e2", color:"#991b1b", border:"1px solid #fca5a5" },
    success:   { background:"#dcfce7", color:"#166534", border:"1px solid #86efac" },
    ghost:     { background:"none", color:BLUE, border:"none" },
  }[variant];
  const disabledStyle = disabled ? { opacity:0.55, filter:"grayscale(20%)" } : {};
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        ...base,
        ...disabledStyle,
        padding: small ? "4px 10px" : "8px 14px",
        borderRadius: 8,
        fontSize: small ? 11 : 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        width: full ? "100%" : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:12, color:"#6b7280", display:"block", marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background:"#fff", border:"0.5px solid #e5e7eb", borderRadius:12, padding:"12px 14px", marginBottom:10, ...style }}>{children}</div>;
}

function Section({ title, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
      <span style={{ fontWeight:600, fontSize:15, color:"#111" }}>{title}</span>
      {action || null}
    </div>
  );
}

function StatGrid({ items }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
      {items.map(i => (
        <div key={i.label} style={{ background:i.bg||BLUE_L, borderRadius:10, padding:"10px 12px" }}>
          <div style={{ fontSize:11, color:i.tx||BLUE }}>{i.icon} {i.label}</div>
          <div style={{ fontSize:20, fontWeight:700, color:i.tx||BLUE, marginTop:2 }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ textAlign:"center", padding:"32px 0", color:"#9ca3af", fontSize:13 }}>{msg}</div>;
}

// Active-brand <option> list shared by the import filter and the addImport modal.
function ActiveBrandOptions({ brands }) {
  return brands.filter(b=>b.status==="Active").map(b=><option key={b.id}>{b.name}</option>);
}

// Active-customer <option> list shared by the adjustment and pause modals.
function ActiveCustomerOptions({ customers }) {
  return customers.filter(c=>c.status==="Active").map(c=><option key={c.id} value={c.id}>{c.name}</option>);
}

// Flex card header with a title (left) and an action node (right), shared by
// the Adjustments / Pause Periods / Diagnostics cards in renderMore.
function CardHeader({ title, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
      <span style={{ fontWeight:600, fontSize:13, color:"#111" }}>{title}</span>
      {action}
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  // FIX-2: Removed upper bound "2026-12-31" — it would freeze today's date
  // for all users after Dec 31 2026. Only the lower bound is needed to guard
  // against a wildly wrong device clock in a demo context.
  const today = useMemo(() => {
    const d = getToday();
    return d >= "2025-01-01" ? d : "2025-01-18";
  }, []);

  const [customers, setCustomers] = useState(seedCustomers);
  const [imports, setImports] = useState(seedImports);
  const [bills, setBills] = useState(seedBills);
  const [logs, setLogs] = useState(seedLogs);
  const [adjustments, setAdjustments] = useState(seedAdjustments);
  const [pauses, setPauses] = useState(seedPauses);
  const [brands, setBrands] = useState(seedBrands);
  const [queue, setQueue] = useState([
    { key:"payment:BL002",      action:"recordPayment", status:"pending", retries:0 },
    { key:"cust-upd:C003",      action:"updateCustomer",status:"failed",  retries:2 },
    { key:"adj:C004:2025-01-10",action:"addAdjustment", status:"dead",    retries:5 },
  ]);

  const [custSearch, setCustSearch] = useState("");
  const [custFilter, setCustFilter] = useState("All");
  const [impFilter, setImpFilter] = useState({ month:"", brand:"", status:"" });
  const [billFilter, setBillFilter] = useState("All");
  const [diagRan, setDiagRan] = useState(false);

  // FIX-4: Initialize billMonth to the real current month, not a hardcoded demo month.
  const [billMonth, setBillMonth] = useState(() => {
    const d = getToday();
    return d >= "2025-01-01" ? d.substring(0, 7) : "2025-01";
  });

  // FIX-3: Initialize logDate to today's real date so the delivery log opens
  // on the current day rather than a hardcoded demo date.
  const [logDate, setLogDate] = useState(() => {
    const d = getToday();
    return d >= "2025-01-01" ? d : "2025-01-18";
  });

  const [form, setForm] = useState({});
  const setF = useCallback(k => e => setForm(p => ({ ...p, [k]: e.target.value })), []);

  // Toast queue with id-based sequencing so stale timers never clear a newer toast
  const toastIdRef = useRef(0);
  const toast$ = (msg, type="info") => {
    const id = ++toastIdRef.current;
    setToast({ id, msg, type });
    setTimeout(() => {
      setToast(curr => (curr && curr.id === id ? null : curr));
    }, 3000);
  };
  useEffect(() => () => { toastIdRef.current = -1; }, []);

  const openModal = (type, data={}) => { setModal({ type, data }); setForm(data); };
  const closeModal = () => { setModal(null); setForm({}); };

  // ── derived (memoized) ──
  const activeC = useMemo(() => customers.filter(c => c.status === "Active"), [customers]);
  const totalRevenue = useMemo(() => bills.filter(b => b.status === "Paid").reduce((s,b) => s+b.paid, 0), [bills]);
  const pendingDues = useMemo(() => bills.filter(b => b.status!=="Paid").reduce((s,b) => s+(b.amount-b.paid), 0), [bills]);
  const confirmedStock = useMemo(() => imports.filter(i => i.status==="Confirmed").reduce((s,i) => s+i.qty, 0), [imports]);
  const todayLogs = useMemo(() => logs.filter(l => l.date === logDate), [logs, logDate]);

  const filteredC = useMemo(() => customers.filter(c => {
    const q = custSearch.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || c.phone.includes(q);
    const matchF = custFilter === "All" || c.status === custFilter;
    return matchQ && matchF;
  }), [customers, custSearch, custFilter]);

  const filteredI = useMemo(() => imports.filter(i => {
    if (impFilter.brand && i.brand !== impFilter.brand) return false;
    if (impFilter.status && i.status !== impFilter.status) return false;
    if (impFilter.month && !i.date.startsWith(impFilter.month)) return false;
    return true;
  }), [imports, impFilter]);

  const filteredB = useMemo(() => bills.filter(b =>
    billFilter === "All" || b.status === billFilter
  ), [bills, billFilter]);

  // ── handlers ──
  const saveCustomer = () => {
    if (!form.name?.trim()) { toast$("Name is required","error"); return; }
    if (!form.address?.trim()) { toast$("Address is required","error"); return; }
    if (form.phone && !/^\d{10}$/.test(cleanPhone(form.phone))) { toast$("Enter valid 10-digit phone","error"); return; }
    if (form.id) {
      setCustomers(p => p.map(c => c.id===form.id ? { ...c, ...form } : c));
      toast$("Customer updated","success");
    } else {
      // FIX-5: Explicitly default `product` for new customers. Without this,
      // if the user never touches the product <select>, form.product is undefined
      // (defaultValue only sets the DOM value, not React state), which breaks
      // billing rate lookup and the customer card display.
      const nc = {
        ...form,
        id: "C"+uuid(),
        status: "Active",
        balance: 0,
        deliveryDays: [1,2,3,4,5,6,0],
        qty: parseFloat(form.qty) || 1,
        product: form.product || "Full Cream",
      };
      setCustomers(p => [...p, nc]);
      toast$("Customer added","success");
    }
    closeModal();
  };

  const deleteCustomer = id => {
    setCustomers(p => p.map(c => c.id===id ? { ...c, status:"Inactive" } : c));
    toast$("Customer deactivated","info");
    closeModal();
  };

  const saveImport = () => {
    const qty = parseFloat(form.qty)||0, rate = parseFloat(form.rate)||0;
    if (!form.date||!form.brand||!form.type) { toast$("Fill required fields","error"); return; }
    if (qty<=0||qty>9999) { toast$("Invalid quantity","error"); return; }
    if (rate<=0) { toast$("Invalid rate","error"); return; }
    const total = Math.round(qty*rate*100)/100;
    if (form.id) {
      setImports(p => p.map(i => i.id===form.id ? { ...i, ...form, qty, rate, total, version:(i.version||1)+1 } : i));
      toast$("Import updated","success");
    } else {
      setImports(p => [...p, { ...form, id:"IMP"+uuid(), qty, rate, total, status:"Draft", version:1 }]);
      toast$("Import saved as Draft","success");
    }
    closeModal();
  };

  const confirmImport = id => {
    setImports(p => p.map(i => i.id===id ? { ...i, status:"Confirmed", version:(i.version||1)+1 } : i));
    toast$("Import confirmed","success");
  };

  const deleteImport = id => {
    setImports(p => p.filter(i => i.id!==id));
    toast$("Import deleted","info");
  };

  const recordPayment = () => {
    const amt = parseFloat(form.payAmt)||0;
    if (amt<=0) { toast$("Enter valid amount","error"); return; }
    const billId = modal?.data?.id;
    setBills(p => p.map(b => {
      if (b.id !== billId) return b;
      const np = Math.min(b.paid+amt, b.amount);
      return { ...b, paid:np, status: np>=b.amount?"Paid":"Partial" };
    }));
    toast$(`${fmt(amt)} via ${form.payMode||"Cash"} recorded`,"success");
    closeModal();
  };

  const lockBill = id => {
    setBills(p => p.map(b => b.id===id ? { ...b, locked:true } : b));
    toast$("Bill locked","info");
  };

  const unlockBill = id => {
    setBills(p => p.map(b => b.id===id ? { ...b, locked:false } : b));
    toast$("Bill unlocked","info");
  };

  const toggleLog = lid => {
    setLogs(p => p.map(l => l.id===lid ? { ...l, delivered:!l.delivered } : l));
  };

  const saveAdjustment = () => {
    const amt = parseFloat(form.amount)||0;
    if (!form.custId||!amt||!form.reason) { toast$("Fill all fields","error"); return; }
    const cust = customers.find(c => c.id===form.custId);
    setAdjustments(p => [...p, { id:"ADJ"+uuid(), custId:form.custId, customer:cust?.name||"", date:form.date||today, amount:amt, reason:form.reason, applied:false }]);
    toast$("Adjustment added","success");
    closeModal();
  };

  const applyAdj = id => {
    setAdjustments(p => p.map(a => a.id===id ? { ...a, applied:true } : a));
    toast$("Adjustment applied to bill","success");
  };

  const savePause = () => {
    if (!form.custId||!form.startDate||!form.endDate) { toast$("Fill all fields","error"); return; }
    const cust = customers.find(c => c.id===form.custId);
    setPauses(p => [...p, { id:"P"+uuid(), custId:form.custId, customer:cust?.name||"", startDate:form.startDate, endDate:form.endDate, reason:form.reason||"" }]);
    setCustomers(p => p.map(c => c.id===form.custId ? { ...c, status:"Paused" } : c));
    toast$("Pause period saved","success");
    closeModal();
  };

  const saveBrand = () => {
    if (!form.name?.trim()) { toast$("Brand name required","error"); return; }
    setBrands(p => [...p, {
      id:"BR"+uuid(),
      name:form.name,
      supplier:form.supplier||"",
      phone:form.phone||"",
      defaultMilkType:form.defaultType||"",
      rate: form.rate !== undefined && form.rate !== "" ? parseFloat(form.rate) : null,
      status:"Active",
    }]);
    toast$("Brand added","success");
    closeModal();
  };

  const retryQueue = key => {
    setQueue(p => p.map(q => q.key===key ? { ...q, status:"pending", retries:0 } : q));
    setTimeout(() => {
      setQueue(p => p.filter(q => q.key!==key));
      toast$("Write synced successfully","success");
    }, 1500);
    toast$("Retrying…","info");
  };

  const dismissQueue = key => {
    setQueue(p => p.filter(q => q.key!==key));
    toast$("Write dismissed","info");
  };

  const generateBill = () => {
    const label = monthLabel(billMonth);
    const totalDaysInMonth = daysInMonth(billMonth);
    const existing = new Set(bills.map(b => b.custId+"-"+b.month));

    const newBills = activeC.filter(c => !existing.has(c.id+"-"+label)).map(c => {
      let scheduledDays = 0;
      for (let d = 1; d <= totalDaysInMonth; d++) {
        const dateStr = billMonth + "-" + String(d).padStart(2,"0");
        const dow = new Date(dateStr).getDay();
        if (c.deliveryDays?.includes(dow)) scheduledDays++;
      }
      const rate = RATE_BY_PRODUCT[c.product] || 32;
      const amount = Math.round(c.qty * rate * scheduledDays);
      const [y,m] = billMonth.split("-").map(Number);
      const dueY = m === 12 ? y+1 : y, dueM = m === 12 ? 1 : m+1;
      return {
        id:"BL"+uuid(), custId:c.id, customer:c.name,
        month:label, amount, paid:0, status:"Unpaid",
        due: `${dueY}-${String(dueM).padStart(2,"0")}-05`, locked:false
      };
    });

    if (newBills.length===0) { toast$("All bills already generated for "+label,"info"); return; }
    setBills(p => [...p, ...newBills]);
    toast$(`${newBills.length} bill(s) generated for ${label}`,"success");
  };

  // FIX-6: Added "noreferrer" alongside "noopener". Without noreferrer, some
  // browsers still expose window.opener to the target page, enabling tab-napping.
  const whatsapp = (phone, billId) => {
    const b = bills.find(x => x.id===billId);
    if (!b) return;
    const digits = cleanPhone(phone);
    if (digits.length < 10) { toast$("Invalid phone number for WhatsApp","error"); return; }
    const text = `Dear ${b.customer},\nYour milk bill for ${b.month}:\nAmount: ₹${b.amount}\nPaid: ₹${b.paid}\nDue: ₹${b.amount-b.paid}\n\nPlease pay by ${b.due}.\n- Milk Delivery Admin V17`;
    window.open(
      `https://wa.me/91${digits.length===10?digits:digits.replace(/^91/,"")}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
    toast$("WhatsApp opened","success");
  };

  const TABS = [
    { id:"dashboard", icon:"🏠", label:"Home" },
    { id:"customers", icon:"👥", label:"Customers" },
    { id:"delivery",  icon:"🚚", label:"Delivery" },
    { id:"imports",   icon:"🥛", label:"Imports" },
    { id:"billing",   icon:"🧾", label:"Billing" },
    { id:"more",      icon:"☰",  label:"More" },
  ];

  // ── render pages ─────────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div>
      <StatGrid items={[
        { label:"Active Customers", value:activeC.length,       icon:"👥" },
        { label:"Stock Confirmed",  value:confirmedStock+" L",  icon:"🥛" },
        { label:"Revenue Jan",      value:fmt(totalRevenue),     icon:"💰", bg:"#dcfce7", tx:"#166534" },
        { label:"Pending Dues",     value:fmt(pendingDues),      icon:"⏳", bg:"#fee2e2", tx:"#991b1b" },
      ]} />

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:10 }}>Today's Delivery — {today}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { label:"Scheduled", value: todayLogs.length },
            { label:"Delivered", value: todayLogs.filter(l=>l.delivered).length },
            { label:"Skipped",   value: todayLogs.filter(l=>!l.delivered).length },
            { label:"Total (L)", value: todayLogs.filter(l=>l.delivered).reduce((s,l)=>s+l.qty,0).toFixed(1)+" L" },
          ].map(x => (
            <div key={x.label} style={{ textAlign:"center", padding:"8px 0" }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#111" }}>{x.value}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>{x.label}</div>
            </div>
          ))}
        </div>
        <Btn full onClick={() => setTab("delivery")} variant="secondary" style={{ marginTop:8 }}>View Delivery Log →</Btn>
      </Card>

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:10 }}>Quick Actions</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { label:"Add Customer",    icon:"👤", fn:()=>openModal("addCustomer") },
            { label:"Add Import",      icon:"📦", fn:()=>openModal("addImport")   },
            { label:"Generate Bills",  icon:"🧾", fn:generateBill                 },
            { label:"Add Adjustment",  icon:"⚖️", fn:()=>openModal("addAdj")      },
            { label:"Add Pause",       icon:"⏸️", fn:()=>openModal("addPause")    },
            { label:"Add Brand",       icon:"🏷️", fn:()=>openModal("addBrand")    },
          ].map(q => (
            <button key={q.label} onClick={q.fn} style={{ background:BLUE_L, color:BLUE, border:"none", borderRadius:10, padding:"10px 8px", fontSize:12, fontWeight:500, cursor:"pointer", textAlign:"left" }}>
              <span style={{ fontSize:16 }}>{q.icon}</span><br />{q.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:10 }}>Write Queue (demo only)</div>
        <div style={{ display:"flex", gap:8, marginBottom: queue.filter(q=>q.status==="dead").length>0?10:0 }}>
          {[
            { label:"Pending", st:"pending", bg:"#dbeafe", tx:"#1e40af" },
            { label:"Failed",  st:"failed",  bg:"#fef9c3", tx:"#854d0e" },
            { label:"Dead",    st:"dead",    bg:"#fee2e2", tx:"#991b1b" },
          ].map(s => (
            <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:8, padding:"8px 0", textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:700, color:s.tx }}>{queue.filter(q=>q.status===s.st).length}</div>
              <div style={{ fontSize:11, color:s.tx }}>{s.label}</div>
            </div>
          ))}
        </div>
        {queue.filter(q=>q.status==="dead").length>0 && (
          <div style={{ background:"#fee2e2", borderRadius:8, padding:"8px 10px", fontSize:12, color:"#991b1b", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>⚠ {queue.filter(q=>q.status==="dead").length} dead write(s)</span>
            <button onClick={()=>setTab("more")} style={{ background:"none", border:"none", color:"#991b1b", fontWeight:600, cursor:"pointer", fontSize:12 }}>View →</button>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:8 }}>Recent Bills</div>
        {bills.slice(0,3).map(b => (
          <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"0.5px solid #f3f4f6" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{b.customer}</div>
              <div style={{ fontSize:11, color:"#6b7280" }}>{b.month}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#111" }}>{fmt(b.amount)}</div>
              <Badge label={b.status} />
            </div>
          </div>
        ))}
        <button onClick={()=>setTab("billing")} style={{ background:"none", border:"none", color:BLUE, fontSize:12, cursor:"pointer", marginTop:8, padding:0 }}>View all bills →</button>
      </Card>
    </div>
  );

  const renderCustomers = () => (
    <div>
      <Section title="Customers" action={<Btn small onClick={()=>openModal("addCustomer")}>+ Add</Btn>} />
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        <input value={custSearch} onChange={e=>setCustSearch(e.target.value)} placeholder="Search…" style={{ ...IS(), flex:1 }} />
        <select value={custFilter} onChange={e=>setCustFilter(e.target.value)} style={{ ...IS(), width:90 }}>
          {["All","Active","Paused","Inactive"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>{filteredC.length} customers</div>
      {filteredC.length===0 ? <Empty msg="No customers found" /> : filteredC.map(c => (
        <Card key={c.id}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14, color:"#111" }}>{c.name}</div>
              <div style={{ fontSize:12, color:"#6b7280", marginTop:2 }}>📍 {c.address}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>📞 {c.phone}</div>
              <div style={{ fontSize:12, color:"#374151", marginTop:4 }}>🥛 {c.qty}L/day · {c.product}</div>
              <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>
                {DAYS.filter((_,i)=>c.deliveryDays?.includes(i)).join(", ")||"No days set"}
              </div>
              {c.balance<0 && <div style={{ fontSize:12, color:"#991b1b", marginTop:2 }}>Due: {fmt(Math.abs(c.balance))}</div>}
            </div>
            <Badge label={c.status} />
          </div>
          <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
            <Btn small variant="secondary" onClick={()=>openModal("editCustomer",c)}>Edit</Btn>
            {c.status==="Active" && <Btn small variant="secondary" onClick={()=>openModal("addPause",{custId:c.id})}>Pause</Btn>}
            <Btn small variant="secondary" onClick={()=>{
              const b = bills.find(x=>x.custId===c.id&&x.status!=="Paid");
              if(b) whatsapp(c.phone, b.id); else toast$("No unpaid bill for "+c.name,"info");
            }}>WhatsApp</Btn>
            <Btn small variant="danger" onClick={()=>deleteCustomer(c.id)}>Deactivate</Btn>
          </div>
        </Card>
      ))}
    </div>
  );

  const renderDelivery = () => {
    const dl = logs.filter(l=>l.date===logDate);
    const delivered = dl.filter(l=>l.delivered);
    return (
      <div>
        <Section title="Daily Delivery Log" />
        <Field label="Select Date">
          <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)} style={IS()} />
        </Field>
        <StatGrid items={[
          { label:"Scheduled", value:dl.length,                                                   icon:"📋" },
          { label:"Delivered", value:delivered.length,                                            icon:"✅", bg:"#dcfce7", tx:"#166534" },
          { label:"Skipped",   value:dl.filter(l=>!l.delivered).length,                          icon:"⏭️", bg:"#fee2e2", tx:"#991b1b" },
          { label:"Qty (L)",   value:delivered.reduce((s,l)=>s+l.qty,0).toFixed(1)+" L",        icon:"🥛" },
        ]} />
        {dl.length===0 ? <Empty msg="No deliveries scheduled for this date" /> : dl.map(l => (
          <Card key={l.id}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:600, fontSize:13, color:"#111" }}>{l.customer}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{l.product} · {l.qty}L</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Badge label={l.delivered?"Delivered":"Skipped"} />
                <button onClick={()=>toggleLog(l.id)} style={{ background:l.delivered?"#dcfce7":"#fee2e2", border:"none", borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:500, cursor:"pointer", color:l.delivered?"#166534":"#991b1b" }}>
                  {l.delivered?"✓ Done":"✗ Skip"}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderImports = () => {
    const totalQty  = filteredI.filter(i=>i.status==="Confirmed").reduce((s,i)=>s+i.qty,0);
    const totalCost = filteredI.filter(i=>i.status==="Confirmed").reduce((s,i)=>s+i.total,0);
    const avgRate   = totalQty>0 ? totalCost/totalQty : 0;
    return (
      <div>
        <Section title="Milk Imports" action={
          <div style={{ display:"flex", gap:6 }}>
            <Btn small variant="secondary" onClick={()=>openModal("addBrand")}>+ Brand</Btn>
            <Btn small onClick={()=>openModal("addImport")}>+ Import</Btn>
          </div>
        } />
        <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
          <input type="month" value={impFilter.month} onChange={e=>setImpFilter(p=>({...p,month:e.target.value}))} style={{ ...IS(), flex:1 }} />
          <select value={impFilter.brand} onChange={e=>setImpFilter(p=>({...p,brand:e.target.value}))} style={{ ...IS(), flex:1 }}>
            <option value="">All Brands</option>
            <ActiveBrandOptions brands={brands} />
          </select>
          <select value={impFilter.status} onChange={e=>setImpFilter(p=>({...p,status:e.target.value}))} style={{ ...IS(), flex:1 }}>
            <option value="">All Status</option>
            {["Draft","Confirmed","Reconciled"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <StatGrid items={[
          { label:"Total Qty",  value:totalQty+" L",           icon:"🥛" },
          { label:"Total Cost", value:fmt(totalCost),           icon:"💰", bg:"#dcfce7", tx:"#166534" },
          { label:"Avg Rate",   value:"₹"+avgRate.toFixed(2)+"/L", icon:"📊" },
          { label:"Imports",    value:filteredI.length,         icon:"📦" },
        ]} />
        {filteredI.length===0 ? <Empty msg="No imports match filters" /> : filteredI.map(imp => (
          <Card key={imp.id}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14, color:"#111" }}>{imp.brand}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{imp.date} · {imp.type}</div>
                <div style={{ fontSize:13, color:"#374151", marginTop:4 }}>{imp.qty} L @ {fmt(imp.rate)}/L = <strong>{fmt(imp.total)}</strong></div>
                {imp.invoice && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{imp.invoice}</div>}
                <div style={{ fontSize:11, color:"#9ca3af" }}>v{imp.version}</div>
              </div>
              <Badge label={imp.status} />
            </div>
            {imp.status==="Draft" && (
              <div style={{ display:"flex", gap:6, marginTop:10 }}>
                <Btn small variant="secondary" onClick={()=>openModal("addImport",imp)}>Edit</Btn>
                <Btn small variant="success" onClick={()=>confirmImport(imp.id)}>Confirm</Btn>
                <Btn small variant="danger" onClick={()=>deleteImport(imp.id)}>Delete</Btn>
              </div>
            )}
          </Card>
        ))}
        <Card style={{ background:"#f8fafc" }}>
          <div style={{ fontWeight:600, fontSize:13, color:"#374151", marginBottom:8 }}>Brands</div>
          {brands.map(b => (
            <div key={b.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"0.5px solid #f3f4f6" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{b.name}</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>{b.supplier} · {b.phone}{b.defaultMilkType?" · "+b.defaultMilkType:""}{b.rate?" · ₹"+b.rate+"/L":""}</div>
              </div>
              <Badge label={b.status} />
            </div>
          ))}
        </Card>
      </div>
    );
  };

  const renderBilling = () => (
    <div>
      <Section title="Billing" action={
        <div style={{ display:"flex", gap:6 }}>
          <Btn small variant="secondary" onClick={generateBill}>Generate</Btn>
        </div>
      } />
      <Field label="Bill Month (for Generate)">
        <input type="month" value={billMonth} onChange={e=>setBillMonth(e.target.value)} style={IS()} />
      </Field>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {["All","Unpaid","Partial","Paid"].map(s => (
          <button key={s} onClick={()=>setBillFilter(s)} style={{ flex:1, padding:"6px 0", fontSize:11, fontWeight:500, border:"0.5px solid #e5e7eb", borderRadius:8, cursor:"pointer", background:billFilter===s?BLUE:"#fff", color:billFilter===s?"#fff":"#374151" }}>{s}</button>
        ))}
      </div>
      <StatGrid items={[
        { label:"Total Billed",  value:fmt(bills.reduce((s,b)=>s+b.amount,0)), icon:"🧾" },
        { label:"Collected",     value:fmt(bills.reduce((s,b)=>s+b.paid,0)),   icon:"✅", bg:"#dcfce7", tx:"#166534" },
        { label:"Pending",       value:fmt(pendingDues),                        icon:"⏳", bg:"#fee2e2", tx:"#991b1b" },
        { label:"Bills",         value:bills.length,                                                    icon:"📄" },
      ]} />
      {filteredB.length===0 ? <Empty msg="No bills match filter" /> : filteredB.map(b => (
        <Card key={b.id}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontWeight:600, fontSize:14, color:"#111" }}>{b.customer}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>{b.month} · Due {b.due}</div>
              <div style={{ fontSize:13, color:"#374151", marginTop:4 }}>
                {fmt(b.paid)} / {fmt(b.amount)}
              </div>
              {b.status!=="Paid" && <div style={{ fontSize:12, color:"#991b1b" }}>Pending: {fmt(b.amount-b.paid)}</div>}
              {b.locked && <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>🔒 Locked</div>}
            </div>
            <Badge label={b.status} />
          </div>
          <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
            {!b.locked && b.status!=="Paid" && <Btn small onClick={()=>openModal("payment",b)}>Record Payment</Btn>}
            {!b.locked && b.status==="Paid" && <Btn small variant="secondary" onClick={()=>lockBill(b.id)}>🔒 Lock</Btn>}
            {b.locked && <Btn small variant="secondary" onClick={()=>unlockBill(b.id)}>🔓 Unlock</Btn>}
            <Btn small variant="secondary" onClick={()=>{
              const c = customers.find(x=>x.id===b.custId);
              if(c) whatsapp(c.phone, b.id);
            }}>WhatsApp</Btn>
            <Btn small variant="secondary" onClick={()=>openModal("billDetail",b)}>View</Btn>
          </div>
        </Card>
      ))}
    </div>
  );

  const renderMore = () => (
    <div>
      <Section title="More" />

      <Card>
        <CardHeader title="Adjustments" action={<Btn small onClick={()=>openModal("addAdj")}>+ Add</Btn>} />
        {adjustments.length===0 ? <Empty msg="No adjustments" /> : adjustments.map(a => (
          <div key={a.id} style={{ padding:"8px 0", borderBottom:"0.5px solid #f3f4f6" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{a.customer}</div>
                <div style={{ fontSize:12, color:"#6b7280" }}>{a.date} · {a.reason}</div>
                <div style={{ fontSize:13, color:a.amount<0?"#991b1b":"#166534", fontWeight:600 }}>{a.amount>0?"+":""}{fmt(a.amount)}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                <Badge label={a.applied?"Applied":"Pending"} />
                {!a.applied && <Btn small variant="success" onClick={()=>applyAdj(a.id)}>Apply</Btn>}
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <CardHeader title="Pause Periods" action={<Btn small onClick={()=>openModal("addPause")}>+ Add</Btn>} />
        {pauses.length===0 ? <Empty msg="No pause periods" /> : pauses.map(p => (
          <div key={p.id} style={{ padding:"8px 0", borderBottom:"0.5px solid #f3f4f6" }}>
            <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{p.customer}</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>{p.startDate} → {p.endDate}</div>
            {p.reason && <div style={{ fontSize:12, color:"#9ca3af" }}>{p.reason}</div>}
          </div>
        ))}
      </Card>

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:4 }}>Write Queue</div>
        <div style={{ fontSize:11, color:"#9ca3af", marginBottom:10 }}>In-memory only in this demo — no IndexedDB, no auto-flush. Retry/Dismiss are simulated.</div>
        {queue.length===0
          ? <div style={{ textAlign:"center", padding:"16px 0", color:"#6b7280", fontSize:13 }}>✅ All writes synced</div>
          : queue.map(q => (
            <div key={q.key} style={{ padding:"10px 0", borderBottom:"0.5px solid #f3f4f6" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{q.action}</div>
                  <div style={{ fontSize:11, color:"#9ca3af", fontFamily:"monospace" }}>{q.key}</div>
                  <div style={{ fontSize:11, color:"#6b7280" }}>Retries: {q.retries}</div>
                </div>
                <Badge label={q.status} />
              </div>
              <div style={{ display:"flex", gap:6, marginTop:8 }}>
                <Btn small onClick={()=>retryQueue(q.key)}>Retry</Btn>
                <Btn small variant="danger" onClick={()=>dismissQueue(q.key)}>Dismiss</Btn>
              </div>
            </div>
          ))
        }
      </Card>

      <Card>
        <CardHeader title="Diagnostics V17" action={<Btn small onClick={()=>{ setDiagRan(true); toast$("19 checks complete","info"); }}>Run</Btn>} />
        {!diagRan
          ? <div style={{ fontSize:12, color:"#9ca3af", textAlign:"center", padding:"12px 0" }}>Tap Run to check diagnostic items</div>
          : [
            ["✅","Missing sheets","OK"],
            ["✅","ShortCode duplicates","OK"],
            ["✅","Duplicate addresses","OK"],
            ["✅","DailyLogsIndex","OK"],
            ["⚠️","Stale bill flags","2 found"],
            ["✅","Unapplied adjustments >60d","OK"],
            ["✅","Untested actions","71/71"],
            ["✅","AmountPaid drift","OK"],
            ["✅","Schema version","V17"],
            ["✅","PINSalt configured","OK"],
            ["⚠️","SystemState rows","512 — high"],
            ["✅","PINRate_ key count","<50"],
            ["✅","Daily execution count","<150"],
            ["✅","Failed batch flags","None"],
            ["✅","Products price history","OK"],
            ["✅","sessionSecret active","Yes"],
            ["✅","Milk import sheets","Present"],
            ["✅","MilkTypes seeded", MILK_TYPES.length+" total"],
            ["✅","MilkBrands seeded", brands.filter(b=>b.status==="Active").length+" active / "+brands.length+" total"],
          ].map(([icon,label,val]) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 0", borderBottom:"0.5px solid #f3f4f6", fontSize:12 }}>
              <span>{icon} {label}</span>
              <span style={{ color: icon==="✅" ? "#166534" : "#854d0e", fontWeight:500 }}>{val}</span>
            </div>
          ))
        }
      </Card>

      <Card>
        <div style={{ fontWeight:600, fontSize:13, color:"#111", marginBottom:8 }}>System Health</div>
        {[
          { label:"Schema Version", value:"V17", ok:true },
          { label:"API Version",    value:"17",  ok:true },
          { label:"Migration",      value:"Not needed", ok:true },
          { label:"Mode",           value:"Frontend demo (no backend connected)", ok:true },
        ].map(x => (
          <div key={x.label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"0.5px solid #f3f4f6", fontSize:12 }}>
            <span style={{ color:"#6b7280" }}>{x.label}</span>
            <span style={{ color:x.ok?"#166534":"#991b1b", fontWeight:500 }}>{x.value}</span>
          </div>
        ))}
        <Btn full variant="secondary" style={{ marginTop:10 }} onClick={()=>toast$("Health check passed — V17","success")}>Run Health Check</Btn>
      </Card>
    </div>
  );

  // ── modals ────────────────────────────────────────────────────────────────
  // Each modal type is a small named closure defined inside App, so it reads
  // form/setF/closeModal/handlers directly from scope — no prop plumbing and
  // the form/modal lockstep invariant stays in one place. renderModal() below
  // is just a dispatch-table lookup on modal.type.
  const renderCustomerModal = () => {
    const { type, data } = modal;
    return (
      <Modal title={type==="editCustomer"?"Edit Customer":"Add Customer"} onClose={closeModal}>
        <Field label="Full Name *"><input style={IS()} defaultValue={data.name} onChange={setF("name")} placeholder="Ramesh Sharma" /></Field>
        <Field label="Delivery Address *"><input style={IS()} defaultValue={data.address} onChange={setF("address")} placeholder="14, Shivaji Nagar" /></Field>
        <Field label="Phone (10 digits)"><input style={IS()} defaultValue={data.phone} onChange={setF("phone")} placeholder="9876543210" /></Field>
        <Field label="Product">
          <select style={IS()} defaultValue={data.product||"Full Cream"} onChange={setF("product")}>
            {PRODUCTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Daily Qty (L)"><input type="number" step="0.5" style={IS()} defaultValue={data.qty||1} onChange={setF("qty")} /></Field>
        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <Btn onClick={saveCustomer}>{type==="editCustomer"?"Update":"Save"}</Btn>
          <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
        </div>
      </Modal>
    );
  };

  const renderImportModal = () => {
    const { data } = modal;
    return (
      <Modal title={data.id?"Edit Import":"Add Milk Import"} onClose={closeModal}>
        <Field label="Date *"><input type="date" style={IS()} defaultValue={data.date||today} onChange={setF("date")} /></Field>
        <Field label="Brand *">
          <select style={IS()} defaultValue={data.brand||""} onChange={setF("brand")}>
            <option value="">Select Brand</option>
            <ActiveBrandOptions brands={brands} />
          </select>
        </Field>
        <Field label="Milk Type *">
          <select style={IS()} defaultValue={data.type||""} onChange={setF("type")}>
            <option value="">Select Type</option>
            {MILK_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <Field label="Qty (L) *"><input type="number" style={IS()} defaultValue={data.qty} onChange={setF("qty")} placeholder="100" /></Field>
          <Field label="Rate (₹/L) *"><input type="number" step="0.5" style={IS()} defaultValue={data.rate} onChange={setF("rate")} placeholder="36" /></Field>
        </div>
        <Field label="Invoice No."><input style={IS()} defaultValue={data.invoice} onChange={setF("invoice")} placeholder="INV-2025-001" /></Field>
        <Field label="Supplier"><input style={IS()} defaultValue={data.supplier} onChange={setF("supplier")} /></Field>
        <Field label="Notes"><input style={IS()} defaultValue={data.notes} onChange={setF("notes")} /></Field>
        <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#166534", marginBottom:12 }}>
          Total: {fmt(Math.round((parseFloat(form.qty??data.qty??0)*parseFloat(form.rate??data.rate??0))*100)/100)}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={saveImport}>{data.id?"Update":"Save Draft"}</Btn>
          <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
        </div>
      </Modal>
    );
  };

  const renderPaymentModal = () => {
    const { data } = modal;
    return (
      <Modal title={"Record Payment — "+data.customer} onClose={closeModal}>
        <div style={{ background:BLUE_L, borderRadius:8, padding:"10px 12px", fontSize:13, color:BLUE, marginBottom:14 }}>
          Bill: {fmt(data.amount)} · Paid: {fmt(data.paid)} · <strong>Pending: {fmt(data.amount-data.paid)}</strong>
        </div>
        <Field label="Amount (₹) *"><input type="number" style={IS()} defaultValue={data.amount-data.paid} onChange={setF("payAmt")} /></Field>
        <Field label="Payment Mode">
          <select style={IS()} onChange={setF("payMode")} defaultValue="Cash">
            {PAY_MODES.map(m=><option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" style={IS()} defaultValue={today} onChange={setF("payDate")} /></Field>
        <Field label="Notes (optional)"><input style={IS()} onChange={setF("payNote")} placeholder="Ref no., remarks…" /></Field>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={recordPayment}>Record {form.payAmt?fmt(form.payAmt):""}</Btn>
          <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
        </div>
      </Modal>
    );
  };

  const renderBillDetailModal = () => {
    const { data } = modal;
    return (
      <Modal title={"Bill — "+data.customer} onClose={closeModal}>
        {[
          ["Bill ID", data.id],
          ["Customer", data.customer],
          ["Month", data.month],
          ["Amount", fmt(data.amount)],
          ["Paid", fmt(data.paid)],
          ["Pending", fmt(data.amount-data.paid)],
          ["Status", data.status],
          ["Due Date", data.due],
          ["Locked", data.locked?"Yes":"No"],
        ].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"0.5px solid #f3f4f6", fontSize:13 }}>
            <span style={{ color:"#6b7280" }}>{k}</span>
            <span style={{ fontWeight:500, color:"#111" }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop:14 }}>
          <Btn full variant="secondary" onClick={closeModal}>Close</Btn>
        </div>
      </Modal>
    );
  };

  const renderAdjustmentModal = () => {
    const { data } = modal;
    return (
      <Modal title="Add Adjustment" onClose={closeModal}>
        <Field label="Customer *">
          <select style={IS()} onChange={setF("custId")} defaultValue={data.custId||""}>
            <option value="">Select Customer</option>
            <ActiveCustomerOptions customers={customers} />
          </select>
        </Field>
        <Field label="Date *"><input type="date" style={IS()} defaultValue={today} onChange={setF("date")} /></Field>
        <Field label="Amount (₹, use – for deduction) *"><input type="number" style={IS()} onChange={setF("amount")} placeholder="-50 or 100" /></Field>
        <Field label="Reason *"><input style={IS()} onChange={setF("reason")} placeholder="Half delivery, Quality issue…" /></Field>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={saveAdjustment}>Save</Btn>
          <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
        </div>
      </Modal>
    );
  };

  const renderPauseModal = () => {
    const { data } = modal;
    return (
      <Modal title="Add Pause Period" onClose={closeModal}>
        <Field label="Customer *">
          <select style={IS()} defaultValue={data.custId||""} onChange={setF("custId")}>
            <option value="">Select Customer</option>
            <ActiveCustomerOptions customers={customers} />
          </select>
        </Field>
        <Field label="Start Date *"><input type="date" style={IS()} defaultValue={today} onChange={setF("startDate")} /></Field>
        <Field label="End Date *"><input type="date" style={IS()} onChange={setF("endDate")} /></Field>
        <Field label="Reason"><input style={IS()} onChange={setF("reason")} placeholder="Out of town, Travel…" /></Field>
        <div style={{ display:"flex", gap:8 }}>
          <Btn onClick={savePause}>Save</Btn>
          <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
        </div>
      </Modal>
    );
  };

  const renderBrandModal = () => (
    <Modal title="Add Milk Brand" onClose={closeModal}>
      <Field label="Brand Name *"><input style={IS()} onChange={setF("name")} placeholder="Amul" /></Field>
      <Field label="Supplier Name"><input style={IS()} onChange={setF("supplier")} placeholder="Amul Dairy Ltd." /></Field>
      <Field label="Supplier Phone"><input style={IS()} onChange={setF("phone")} placeholder="9000000001" /></Field>
      <Field label="Default Milk Type">
        <select style={IS()} defaultValue="" onChange={setF("defaultType")}>
          <option value="">Select Type</option>
          {MILK_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Rate per Litre (₹)"><input type="number" step="0.5" style={IS()} onChange={setF("rate")} placeholder="36" /></Field>
      <div style={{ display:"flex", gap:8 }}>
        <Btn onClick={saveBrand}>Save</Btn>
        <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
      </div>
    </Modal>
  );

  // modal.type → renderer. addCustomer and editCustomer share renderCustomerModal,
  // which internally reads modal.type to pick its own title/button label.
  const MODAL_RENDERERS = {
    addCustomer:  renderCustomerModal,
    editCustomer: renderCustomerModal,
    addImport:    renderImportModal,
    payment:      renderPaymentModal,
    billDetail:   renderBillDetailModal,
    addAdj:       renderAdjustmentModal,
    addPause:     renderPauseModal,
    addBrand:     renderBrandModal,
  };

  const renderModal = () => {
    if (!modal) return null;
    const r = MODAL_RENDERERS[modal.type];
    return r ? r() : null;
  };

  const pageMap = { dashboard:renderDashboard, customers:renderCustomers, delivery:renderDelivery, imports:renderImports, billing:renderBilling, more:renderMore };

  return (
    <div style={{ fontFamily:"system-ui,sans-serif", maxWidth:420, margin:"0 auto", background:"#f8fafc", minHeight:640, position:"relative", paddingBottom:68 }}>
      {/* Header */}
      <div style={{ background:BLUE, color:"#fff", padding:"14px 16px 10px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:200 }}>
        <div>
          <div style={{ fontSize:10, opacity:0.7, letterSpacing:0.8 }}>MILK DELIVERY ADMIN V17</div>
          <div style={{ fontSize:16, fontWeight:700, marginTop:1 }}>
            {{ dashboard:"Dashboard", customers:"Customers", delivery:"Daily Delivery", imports:"Milk Imports", billing:"Billing", more:"More" }[tab]}
          </div>
        </div>
        <div style={{ textAlign:"right", fontSize:11, opacity:0.85 }}>
          <div>{today}</div>
          <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", marginTop:2 }}>
            <span style={{ width:6, height:6, background:"#4ade80", borderRadius:"50%", display:"inline-block" }} />
            Online
          </div>
        </div>
      </div>

      {/* Page */}
      <div style={{ padding:"14px 12px" }}>{(pageMap[tab]||renderDashboard)()}</div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:420, background:"#fff", borderTop:"0.5px solid #e5e7eb", display:"flex", zIndex:300 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, padding:"9px 2px 7px", background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, position:"relative" }}>
            {t.id==="more" && queue.filter(q=>q.status==="dead").length>0 && (
              <span style={{ position:"absolute", top:6, right:"20%", width:7, height:7, background:"#ef4444", borderRadius:"50%", display:"block" }} />
            )}
            <span style={{ fontSize:17 }}>{t.icon}</span>
            <span style={{ fontSize:10, fontWeight:tab===t.id?600:400, color:tab===t.id?BLUE:"#9ca3af" }}>{t.label}</span>
            {tab===t.id && <span style={{ position:"absolute", bottom:0, left:"20%", right:"20%", height:2, background:BLUE, borderRadius:2 }} />}
          </button>
        ))}
      </div>

      {renderModal()}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)} key={toast.id} />}
    </div>
  );
}
