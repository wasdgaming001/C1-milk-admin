// ── constants.js ──────────────────────────────────────────────────────────────
// Brand + palette constants shared across UI primitives and pages.

// Primary palette
export const BLUE   = "#1e40af";
export const BLUE_L = "#dbeafe";

// Status → badge colors. Used by <Badge label={status}/> to pick background/text.
export const SC = {
  Active: { bg: "#dcfce7", tx: "#166534" },
  Paused: { bg: "#fef3c7", tx: "#92400e" },
  Inactive: { bg: "#f3f4f6", tx: "#374151" },
  Draft: { bg: "#e0e7ff", tx: "#3730a3" },
  Confirmed: { bg: "#dcfce7", tx: "#166534" },
  Paid: { bg: "#dcfce7", tx: "#166534" },
  Unpaid: { bg: "#fee2e2", tx: "#991b1b" },
  Partial: { bg: "#fef3c7", tx: "#92400e" },
  pending: { bg: "#fef3c7", tx: "#92400e" },
  failed: { bg: "#fee2e2", tx: "#991b1b" },
  dead: { bg: "#fee2e2", tx: "#991b1b" },
  Reconciled:{ bg:"#e0f2fe", tx:"#075985" },
  Applied:   { bg:"#dcfce7", tx:"#166534" },
  Pending:   { bg:"#fef9c3", tx:"#854d0e" },
  Delivered: { bg:"#dcfce7", tx:"#166534" },
  Skipped:   { bg:"#fee2e2", tx:"#991b1b" },
};

// Day-of-week labels (en-IN). Month names live inline in utils.js#monthLabel.
export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Domain enumerations
export const MILK_TYPES = ["Full Cream","Toned","Double Toned","Skimmed","Standardised"];
export const PRODUCTS   = ["Full Cream","Toned","Double Toned","Skimmed","Standardised"];
export const PAY_MODES  = ["Cash","UPI","PhonePe","GPay","Paytm","Bank Transfer","Cheque"];

