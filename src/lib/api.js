
// src/lib/api.js
export function mapCustomerFromApi(c) {
  return {
    id: c.customerId, name: c.name, address: c.deliveryAddress,
    phone: c.phone, status: c.status, product: c.product,
    qty: c.dailyQty, deliveryDays: c.deliveryDays, balance: c.balance, version: c.version,
  };
}

export function mapCustomerToApi(form) {
  return {
    customerId: form.id || undefined, 
    expectedVersion: form.version, 
    name: form.name, deliveryAddress: form.address, phone: form.phone,
    product: form.product, dailyQty: form.qty, deliveryDays: form.deliveryDays, status: form.status,
    // FIX B5: Removed idempotencyKey generation to prevent duplication
  };
}

export async function callApi(action, payload = {}) {
  const token = localStorage.getItem("token");
  const sessionSecret = localStorage.getItem("sessionSecret");

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
      // FIX B3: 401 Interceptor. If backend rejects token, force logout.
      const errorCode = result.error?.code;
      if (errorCode === 'UNAUTHORIZED' || errorCode === 'SESSION_EXPIRED' || errorCode === 'INVALID_TOKEN') {
        localStorage.removeItem("token");
        localStorage.removeItem("sessionSecret");
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