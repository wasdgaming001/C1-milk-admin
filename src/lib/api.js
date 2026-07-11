// src/lib/api.js

// --- RESPONSE MAPPERS (Backend -> Frontend) ---

export function mapCustomerFromApi(c) {
  let days = [];
  try {
    const d = c.deliveryDays;
    if (Array.isArray(d)) days = d;
    else if (typeof d === 'string' && d.trim()) days = JSON.parse(d);
  } catch (e) { days = []; }

  return {
    id: c.customerId,
    name: c.name,
    address: c.deliveryAddress,
    phone: c.phone,
    status: c.status,
    product: c.product,
    qty: Number(c.dailyQty || 0),       
    deliveryDays: days,                 
    balance: Number(c.balance || 0),     
    version: c.version,
  };
}


export function mapBillFromApi(b) {
  return {
    id: b.billId,
    custId: b.customerId,
    month: b.month,
    amount: Number(b.amount || 0),       
    paid: Number(b.amountPaid || 0),    
    due: b.dueDate,
    status: b.status,
    version: b.version,
    locked: !!b.locked,
  };
}

export function mapImportFromApi(i) {
 return {
   id: i.importId,
   brand: i.brandName,
   type: i.milkType,
   qty: i.quantity,
   rate: i.ratePerLiter,
   total: i.totalCost,
   invoice: i.invoiceNumber,
   supplier: i.supplierName,
   date: i.date,
   status: i.status,
   version: i.version || i.Version || 1,
 };
}

export function mapLogFromApi(l) {
 return {
   id: l.logId,
   custId: l.customerId,
   date: l.date,
   delivered: !!l.delivered,
   status: l.status,
   source: l.source || "SUBSCRIPTION",
   reason: l.reason || "",
   qty: Number(l.quantity || l.qty || 0),
   product: l.product || l.milkType || "",
 };
}

export function mapAdjustmentFromApi(a) {
  return {
    adjustmentId: a.adjustmentId,
    billId: a.billId || "",
    customerId: a.customerId,
    amount: Number(a.amount || 0),
    reason: a.reason || "",
    applied: a.applied !== undefined ? !!a.applied : (a.status === "Applied" || a.status === "TRUE"),
    date: a.date,
    createdAt: a.createdAt,
  };
}

export function mapPauseFromApi(p) {
 return {
   id: p.pauseId,
   custId: p.customerId,
   start: p.startDate,
   end: p.endDate,
   reason: p.reason,
 };
}

export function mapBrandFromApi(b) {
  return {
    id: b.brandId,
    name: b.brandName,
    status: b.status,
    supplier: b.supplierName,
    phone: b.supplierPhone,
    defaultMilkType: b.defaultMilkType,
    rate: Number(b.ratePerLiter || 0),  
  };
}

export function mapSubscriptionFromApi(s) {
 return {
   id: s.id || "",
   customerId: s.customerId || "",
   customerName: s.customerName || "Unknown Customer",
   milkType: s.milkType || "FULL_CREAM",
   quantity: Number(s.quantity) || 0,
   deliveryDays: Array.isArray(s.deliveryDays) ? s.deliveryDays : [],
   isActive: s.isActive === true || s.isActive === "TRUE",
   version: Number(s.version) || 1,
 };
}

export function mapCreditNoteFromApi(c) {
 return {
   id: c.id,
   customerId: c.customerId,
   billId: c.billId || "",
   amount: Number(c.amount),
   reason: c.reason,
   createdAt: c.createdAt,
 };
}

// --- REQUEST MAPPERS (Frontend -> Backend) ---

const generateKey = () =>
 `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

export function mapCustomerToApi(form) {
 return {
   customerId: form.id || undefined,
   expectedVersion: form.version,
   name: form.name,
   deliveryAddress: form.address,
   phone: form.phone,
   product: form.product,
   dailyQty: form.qty,
   deliveryDays: form.deliveryDays,
   status: form.status,
   idempotencyKey: form.id ? undefined : generateKey(),
 };
}

export function mapImportToApi(form) {
 const out = {
   brandName: form.brand,
   milkType: form.type,
   quantity: Number(form.qty),
   ratePerLiter: Number(form.rate),
   totalCost: Number(form.total),
   invoiceNumber: form.invoice,
   supplierName: form.supplier,
   date: form.date,
 };

 if (form.id) {
   out.id = form.id;
   out.expectedVersion = form.version;
 } else {
   out.idempotencyKey = generateKey();
 }

 return out;
}

export function mapPaymentToApi(billId, amount, opts = {}) {
 return {
   billId,
   amount: Number(amount),
   mode: opts.mode || "Cash",
   date: opts.date,
   note: opts.note,
   idempotencyKey: generateKey(),
 };
}

// --- API CLIENT ---

// FIX (AI-1 Medium 10): Added localStorage fallback to match comment and readSecret
export function readToken() {
 return sessionStorage.getItem("token") || localStorage.getItem("token");
}

export function readSecret() {
 return (
   sessionStorage.getItem("sessionSecret") ||
   localStorage.getItem("sessionSecret")
 );
}

export async function callApi(action, payload = {}) {
 const token = readToken();
 const sessionSecret = readSecret();

 const body = { action, payload };
 if (token) body.token = token;
 if (sessionSecret) body.sessionSecret = sessionSecret;

 try {
   const response = await fetch("/api", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify(body),
   });

   const result = await response.json();

   if (!result.success) {
     const errorCode = result.error?.code || result.error?.status || result.error;
     
     if (errorCode === "UNAUTHORIZED" || errorCode === "SESSION_EXPIRED" || errorCode === "INVALID_TOKEN") {
       sessionStorage.removeItem("token");
       sessionStorage.removeItem("sessionSecret");
       localStorage.removeItem("token"); // Also clear fallback
       localStorage.removeItem("sessionSecret");
       window.dispatchEvent(new CustomEvent("auth:expired"));
       
       // FIX (AI-1 Critical 4): Throw error instead of returning hanging promise
       throw new Error("Session expired");
     }
     throw new Error(result.error?.message || "Unknown API error");
   }

   return result.data;
 } catch (err) {
   console.error(`Network Error [${action}]:`, err);
   throw err;
 }
}