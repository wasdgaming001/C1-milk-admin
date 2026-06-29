// src/hooks/useAppHandlers.js
import { useCallback, useMemo } from "react";
import { fmt, cleanPhone} from "../lib/utils.js";
import { validateCustomerForm, validateImportForm, parseImportValues } from "../lib/validation.js";
import { callApi, mapCustomerToApi } from "../lib/api.js";

// Helper to map frontend form to backend payload for imports
const mapImportToApi = (form, parsed) => ({
  importId: form.id || undefined, expectedVersion: form.version,
  date: form.date, brandId: form.brandId, milkType: form.milkType,
  qty: parsed.qty, rate: parsed.rate, total: parsed.total, status: form.status,
});

function useCustomerHandlers({ setCustomers, form, toast$, closeModal }) {
  const saveCustomer = useCallback(async () => {
    const err = validateCustomerForm(form);
    if (err) { toast$(err, "error"); return; }
    try {
      if (form.id) {
        await callApi("updateCustomer", mapCustomerToApi(form));
        setCustomers(p => p.map(c => c.id === form.id ? { ...c, ...form, version: (c.version || 1) + 1 } : c));
        toast$("Customer updated", "success");
      } else {
        const res = await callApi("addCustomer", mapCustomerToApi(form));
        setCustomers(p => [...p, { ...form, id: res.customerId, version: 1 }]);
        toast$("Customer added", "success");
      }
      closeModal();
    } catch (e) { toast$("Save failed: " + e.message, "error"); }
  }, [form, setCustomers, toast$, closeModal]);

  const deleteCustomer = useCallback(async (id) => {
    try {
      await callApi("deactivateCustomer", { customerId: id });
      setCustomers(p => p.map(c => c.id === id ? { ...c, status: "Inactive" } : c));
      toast$("Customer deactivated", "info"); closeModal();
    } catch (e) { toast$("Failed: " + e.message, "error"); }
  }, [setCustomers, toast$, closeModal]);

  return { saveCustomer, deleteCustomer };
}

function useImportHandlers({ setImports, form, toast$, closeModal }) {
  const saveImport = useCallback(async () => {
    const err = validateImportForm(form);
    if (err) { toast$(err, "error"); return; }
    const parsed = parseImportValues(form);
    try {
      if (form.id) {
        await callApi("updateMilkImport", mapImportToApi(form, parsed));
        setImports(p => p.map(i => i.id === form.id ? { ...i, ...form, ...parsed, version: (i.version || 1) + 1 } : i));
        toast$("Import updated", "success");
      } else {
        const res = await callApi("addMilkImport", mapImportToApi(form, parsed));
        setImports(p => [...p, { ...form, id: res.importId, ...parsed, status: "Draft", version: 1 }]);
        toast$("Import saved", "success");
      }
      closeModal();
    } catch (e) { toast$("Save failed: " + e.message, "error"); }
  }, [form, setImports, toast$, closeModal]);

  const confirmImport = useCallback(async (id) => {
    try { await callApi("confirmMilkImport", { importId: id }); setImports(p => p.map(i => i.id === id ? { ...i, status: "Confirmed" } : i)); toast$("Confirmed", "success"); } catch(e) { toast$(e.message, "error"); }
  }, [setImports, toast$]);

  const deleteImport = useCallback(async (id) => {
    try { await callApi("deleteMilkImport", { importId: id }); setImports(p => p.filter(i => i.id !== id)); toast$("Deleted", "info"); } catch(e) { toast$(e.message, "error"); }
  }, [setImports, toast$]);

  return { saveImport, confirmImport, deleteImport };
}

function useBillHandlers({ setBills, form, modal, toast$, closeModal, activeC, bills, billMonth }) {
  const recordPayment = useCallback(async () => {
    const amt = parseFloat(form.payAmt) || 0;
    if (amt <= 0) { toast$("Enter valid amount", "error"); return; }
    const billId = modal?.data?.id;
    try {
      await callApi("recordPayment", { billId, amount: amt, mode: form.payMode || "Cash" });
      setBills(p => p.map(b => b.id === billId ? { ...b, paid: (b.paid || 0) + amt, status: "Paid" } : b));
      toast$(`₹${amt} recorded`, "success"); closeModal();
    } catch(e) { toast$(e.message, "error"); }
  }, [form, modal, setBills, toast$, closeModal]);

  const lockBill = useCallback(async (id) => { try { await callApi("lockBill", { billId: id }); setBills(p => p.map(b => b.id === id ? { ...b, locked: true } : b)); toast$("Locked", "info"); } catch(e){} }, [setBills, toast$]);
  const unlockBill = useCallback(async (id) => { try { await callApi("unlockBill", { billId: id }); setBills(p => p.map(b => b.id === id ? { ...b, locked: false } : b)); toast$("Unlocked", "info"); } catch(e){} }, [setBills, toast$]);

  const generateBill = useCallback(async () => {
    try {
      const res = await callApi("generateMonthlyBills", { month: billMonth });
      if (res.newBills) setBills(p => [...p, ...res.newBills]);
      toast$(`Generated ${res.newBills?.length || 0} bills`, "success");
    } catch(e) { toast$(e.message, "error"); }
  }, [billMonth, setBills, toast$]);

  return { recordPayment, lockBill, unlockBill, generateBill };
}

function useAdjustmentHandlers({ setAdjustments, setCustomers, setPauses, form, customers, today, toast$, closeModal }) {
  const saveAdjustment = useCallback(async () => {
    const amt = parseFloat(form.amount) || 0;
    if (!form.custId || !amt || !form.reason) { toast$("Fill all fields", "error"); return; }
    try {
      const res = await callApi("addAdjustment", { customerId: form.custId, amount: amt, reason: form.reason, date: form.date || today });
      setAdjustments(p => [...p, { id: res.adjustmentId, custId: form.custId, amount: amt, reason: form.reason, date: form.date || today, applied: false }]);
      toast$("Added", "success"); closeModal();
    } catch(e) { toast$(e.message, "error"); }
  }, [form, customers, today, setAdjustments, toast$, closeModal]);

  const applyAdj = useCallback(async (id) => { try { await callApi("applyAdjustment", { adjustmentId: id }); setAdjustments(p => p.map(a => a.id === id ? { ...a, applied: true } : a)); toast$("Applied", "success"); } catch(e){} }, [setAdjustments, toast$]);

  const savePause = useCallback(async () => {
    if (!form.custId || !form.startDate || !form.endDate) { toast$("Fill all fields", "error"); return; }
    try {
      await callApi("addPause", { customerId: form.custId, startDate: form.startDate, endDate: form.endDate, reason: form.reason || "" });
      setPauses(p => [...p, { custId: form.custId, startDate: form.startDate, endDate: form.endDate, reason: form.reason || "" }]);
      setCustomers(p => p.map(c => c.id === form.custId ? { ...c, status: "Paused" } : c));
      toast$("Saved", "success"); closeModal();
    } catch(e) { toast$(e.message, "error"); }
  }, [form, customers, setPauses, setCustomers, toast$, closeModal]);

  return { saveAdjustment, applyAdj, savePause };
}

function useBrandHandlers({ setBrands, form, toast$, closeModal }) {
  const saveBrand = useCallback(async () => {
    if (!form.name?.trim()) { toast$("Brand name required", "error"); return; }
    try {
      await callApi("addBrand", { name: form.name, supplier: form.supplier || "", phone: form.phone || "", defaultMilkType: form.defaultType || "", rate: form.rate || 0 });
      setBrands(p => [...p, { name: form.name, supplier: form.supplier || "", phone: form.phone || "", defaultMilkType: form.defaultType || "", rate: form.rate || 0, status: "Active" }]);
      toast$("Added", "success"); closeModal();
    } catch(e) { toast$(e.message, "error"); }
  }, [form, setBrands, toast$, closeModal]);
  return { saveBrand };
}

function useOtherHandlers({ setLogs, bills, toast$ }) {
  const toggleLog = useCallback(async (lid) => {
    try { await callApi("toggleDeliveryLog", { logId: lid }); setLogs(p => p.map(l => l.id === lid ? { ...l, delivered: !l.delivered } : l)); } catch(e){}
  }, [setLogs]);

  const whatsapp = useCallback((phone, billId) => {
    const b = bills.find(x => x.id === billId);
    if (!b) return;
    const digits = cleanPhone(phone);
    if (digits.length < 10) { toast$("Invalid phone", "error"); return; }
    const text = `Dear ${b.customer},\nYour milk bill for ${b.month}:\nAmount: ₹${b.amount}\nPaid: ₹${b.paid}\nDue: ₹${b.amount - b.paid}\n\nPlease pay by ${b.due}.\n- Milk Delivery Admin V17`;
    window.open(`https://wa.me/91${digits.length === 10 ? digits : digits.replace(/^91/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    toast$("WhatsApp opened", "success");
  }, [bills, toast$]);

  return { toggleLog, whatsapp };
}

export function useAppHandlers(state) {
  const { customers, bills, setCustomers, setImports, setBills, setLogs, setAdjustments, setPauses, setBrands, form, modal, today, billMonth, toast$, closeModal, activeC } = state;

  const customerHandlers = useCustomerHandlers({ setCustomers, form, toast$, closeModal });
  const importHandlers = useImportHandlers({ setImports, form, toast$, closeModal });
  const billHandlers = useBillHandlers({ setBills, form, modal, toast$, closeModal, activeC, bills, billMonth });
  const adjustmentHandlers = useAdjustmentHandlers({ setAdjustments, setCustomers, setPauses, form, customers, today, toast$, closeModal });
  const brandHandlers = useBrandHandlers({ setBrands, form, toast$, closeModal });
  const otherHandlers = useOtherHandlers({ setLogs, bills, toast$ });

  return useMemo(() => ({
    ...customerHandlers, ...importHandlers, ...billHandlers,
    ...adjustmentHandlers, ...brandHandlers, ...otherHandlers,
    retryQueue: () => {}, dismissQueue: () => {}, // Fix C1: Stub out the fake queue handlers
  }), [customerHandlers, importHandlers, billHandlers, adjustmentHandlers, brandHandlers, otherHandlers]);
}