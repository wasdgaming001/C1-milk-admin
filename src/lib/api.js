// src/lib/api.js

// --- RESPONSE MAPPERS (Backend -> Frontend) ---

export function mapCustomerFromApi(c) {
  return {
    id: c.customerId,
    name: c.name,
    address: c.deliveryAddress,
    phone: c.phone,
    status: c.status,
    product: c.product,
    qty: c.dailyQty,
    deliveryDays: c.deliveryDays,
    balance: c.balance,
    version: c.version,
  };
}

export function mapBillFromApi(b) {
  return {
    id: b.billId,
    custId: b.customerId,
    month: b.month,
    amount: b.amount,
    paid: b.amountPaid,
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
  };
}

export function mapLogFromApi(l) {
  return {
    id: l.logId,
    custId: l.customerId,
    date: l.date,
    delivered: l.status === "DELIVERED", // Adjust based on your actual status logic
    status: l.status,
    source: l.source || "SUBSCRIPTION",
    reason: l.reason || "",
    qty: Number(l.quantity || l.qty || 0),
    product: l.product || l.milkType || "",
  };
}

export function mapAdjustmentFromApi(a) {
  return {
    id: a.adjustmentId,
    billId: a.billId,
    custId: a.customerId,
    applied: !!a.applied,
    reason: a.reason,
    amount: a.amount,
    date: a.date,
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

// Safe ID generation: completely avoids crypto.randomUUID issues in jsdom/test environments
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
  return {
    brandName: form.brand,
    milkType: form.type,
    quantity: Number(form.qty),
    ratePerLiter: Number(form.rate),
    totalCost: Number(form.total),
    invoiceNumber: form.invoice,
    supplierName: form.supplier,
    date: form.date,
    idempotencyKey: generateKey(),
  };
}

export function mapPaymentToApi(billId, amount) {
  return {
    billId,
    amountPaid: Number(amount),
    idempotencyKey: generateKey(),
  };
}

// --- API CLIENT ---

// Read tokens from sessionStorage (matches useAuth.js). Falling back to
// localStorage lets us read any tokens set by previous app versions before
// the user logs out and back in — they get carried forward without a forced
// re-auth on first request after the upgrade.
function readToken() {
  return sessionStorage.getItem("token") || localStorage.getItem("token");
}
function readSecret() {
  return (
    sessionStorage.getItem("sessionSecret") ||
    localStorage.getItem("sessionSecret")
  );
}
function clearTokens() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("sessionSecret");
  localStorage.removeItem("token");
  localStorage.removeItem("sessionSecret");
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
      // 401 Interceptor: If backend rejects token, force logout.
      const errorCode = result.error?.code;
      if (
        errorCode === "UNAUTHORIZED" ||
        errorCode === "SESSION_EXPIRED" ||
        errorCode === "INVALID_TOKEN"
      ) {
        clearTokens();
        window.location.reload();
      }
      throw new Error(result.error?.message || "Unknown API error");
    }

    return result.data;
  } catch (err) {
    console.error(`Network Error [${action}]:`, err);
    throw err;
  }
}
