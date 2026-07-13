export function validateImportForm(form) {
  if (!form.date || !form.brand || !form.type) return "Fill required fields";
  const qty = parseFloat(form.qty) || 0;
  if (qty <= 0 || qty > 5000) return "Invalid quantity";
  if ((parseFloat(form.rate) || 0) <= 0) return "Invalid rate";
  return null;
}

export function parseImportValues(form) {
  const qty = parseFloat(form.qty) || 0;
  const rate = parseFloat(form.rate) || 0;
  const total = Math.round(qty * rate * 100) / 100;
  return { qty, rate, total };
}

export function parseOptionalRate(value) {
  if (value === undefined || value === "") return null;
  return parseFloat(value);
}
