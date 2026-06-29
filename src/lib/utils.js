// ── utils.js ─────────────────────────────────────────────────────────────────
// Pure helpers — no React, no DOM. Safe to import anywhere.

// Locale-aware currency formatter. Returns "₹0.00" for missing/invalid input so
// callers don't need to guard before rendering.
export const fmt = n => {
  const num = Number(n);
  if (n === undefined || n === null || isNaN(num)) return "₹0.00";
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Current date in Asia/Kolkata, formatted as YYYY-MM-DD (matches <input type="date"/>).
export const getToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Strip every non-digit character from a phone string before validation/use.
export const cleanPhone = p => String(p || "").replace(/\D/g, "");


// Monotonic id generator. Counter lives at module scope so it survives across
// renders within a session (resets only on full page reload).
let _uuidCounter = 0;
export const uuid = () => {
  _uuidCounter += 1;
  return Date.now().toString(36).toUpperCase().slice(-4) + "-" + _uuidCounter.toString(36).toUpperCase().padStart(4, "0");
};