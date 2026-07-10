// Pure list filters — no React, easy to test in isolation.

export function filterCustomers(customers, search, statusFilter) {
  // FIXED: Added null/undefined guard and trim
  const q = (search || "").toLowerCase().trim();
  
  return customers.filter(c => {
    const matchesStatus = !statusFilter || statusFilter === "All" || c.status === statusFilter;
    if (!matchesStatus) return false;
    
    if (!q) return true;
    
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  });
}

export function filterImports(imports, { month, brand, status }) {
  return imports.filter(
    (i) =>
      (!brand || i.brand === brand) &&
      (!status || i.status === status) &&
      (!month || i.date.startsWith(month)),
  );
}

export function filterBills(bills, billFilter) {
  return billFilter === "All"
    ? bills
    : bills.filter((b) => b.status === billFilter);
}
