
// src/hooks/useEntityStore.js
import { useState, useEffect } from "react";
import { callApi, mapCustomerFromApi } from "../lib/api.js";

export function useEntityStore(token) {
  const [customers, setCustomers] = useState([]);
  const [imports, setImports] = useState([]);
  const [bills, setBills] = useState([]);
  const [logs, setLogs] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [brands, setBrands] = useState([]);
  const [queue, setQueue] = useState([]); // Fix C1/C6: Empty the fake queue

  // FIX A5 & C6: Fetch ALL entities when token becomes available
  useEffect(() => {
    if (!token) return; // Wait for login

    callApi("getCustomers", { limit: 500 }).then(d => setCustomers((d.customers || []).map(mapCustomerFromApi))).catch(console.error);
    callApi("getMilkImports", {}).then(d => setImports(d.imports || [])).catch(console.error);
    callApi("getBills", {}).then(d => setBills(d.bills || [])).catch(console.error);
    callApi("getAdjustments", {}).then(d => setAdjustments(d.adjustments || [])).catch(console.error);
    callApi("getPauses", {}).then(d => setPauses(d.pauses || [])).catch(console.error);
    callApi("getBrands", {}).then(d => setBrands(d.brands || [])).catch(console.error);
    
    // Fetch today's logs
    const today = new Date().toISOString().split('T')[0];
    callApi("getDailyLogs", { date: today }).then(d => setLogs(d.logs || [])).catch(console.error);

  }, [token]); // Re-run when token changes!

  return {
    customers, setCustomers, imports, setImports, bills, setBills,
    logs, setLogs, adjustments, setAdjustments, pauses, setPauses,
    brands, setBrands, queue, setQueue,
  };
}

export function useFilterState() {
  const [custSearch, setCustSearch] = useState("");
  const [custFilter, setCustFilter] = useState("All");
  const [impFilter, setImpFilter] = useState({ month: "", brand: "", status: "" });
  const [billFilter, setBillFilter] = useState("All");
  const [diagRan, setDiagRan] = useState(false);

  return {
    custSearch, setCustSearch, custFilter, setCustFilter,
    impFilter, setImpFilter, billFilter, setBillFilter,
    diagRan, setDiagRan,
  };
}