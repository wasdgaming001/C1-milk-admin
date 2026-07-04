import { useMemo, useCallback } from "react";
import {
  callApi,
  mapCustomerFromApi,
  mapBillFromApi,
  mapImportFromApi,
  mapLogFromApi,
  mapAdjustmentFromApi,
  mapPauseFromApi,
  mapBrandFromApi,
  mapSubscriptionFromApi,
  mapCustomerToApi,
  mapImportToApi,
  mapPaymentToApi,
} from "../lib/api.js";
import { getToday } from "../lib/utils.js";
import { validateCustomerForm, validateImportForm } from "../lib/validation.js";

// fallow-ignore-next-line complexity
export function useAppHandlers(state) {
  const {
    customers,
    setCustomers,
    setBills,
    setImports,
    setLogs,
    setAdjustments,
    setBrands,
    setSubscriptions,
    setPauses, // ✅ Added for refetching pauses
    toast$,
    closeModal,
    form = {},
    modal = {},
  } = state;

  const showToast = useCallback((msg, type) => toast$(msg, type), [toast$]);

  // 1. Customer Handlers
  const customerHandlers = useMemo(
    () => ({
      addCustomer: async (formArg) => {
        const f = formArg || form;
        try {
          const payload = mapCustomerToApi(f);
          await callApi("addCustomer", payload);
          showToast("Customer added", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER (No more optimistic guessing)
          const res = await callApi("getCustomers", {});
          setCustomers((res.customers || []).map(mapCustomerFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      updateCustomer: async (formArg) => {
        const f = formArg || form;
        try {
          const payload = mapCustomerToApi(f);
          await callApi("updateCustomer", payload);
          showToast("Customer updated", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getCustomers", {});
          setCustomers((res.customers || []).map(mapCustomerFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [setCustomers, showToast, closeModal, form],
  );

  // 2. Billing Handlers
  const billingHandlers = useMemo(() => {
    const getPaymentData = (billIdArg, amountArg) => {
      const billId = billIdArg || modal.data?.id || modal.data?.billId;
      const amount = amountArg !== undefined ? amountArg : form.payAmt;
      return { billId, amount };
    };

    const getAdjustmentData = (billIdArg, amountArg, reasonArg) => {
      const billId = billIdArg || form.custId || form.billId || modal.data?.id;
      const amount = amountArg !== undefined ? amountArg : form.amount;
      const reason = reasonArg !== undefined ? reasonArg : form.reason;
      return { billId, amount, reason };
    };

    return {
      recordPayment: async (billIdArg, amountArg) => {
        const { billId, amount } = getPaymentData(billIdArg, amountArg);
        if (!amount || Number(amount) <= 0) {
          showToast("Enter valid amount", "error");
          return;
        }
        try {
          const payload = mapPaymentToApi(billId, amount);
          await callApi("recordPayment", payload);
          showToast(`₹${amount} recorded`, "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getBills", {});
          setBills((res.bills || []).map(mapBillFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },

      generateMonthlyBills: async (month) => {
        try {
          const activeCustomers = customers.filter((c) => c.status === "Active");
          for (const c of activeCustomers) {
            await callApi("generateMonthBill", {
              customerId: c.id,
              month,
            }).catch(() => {});
          }
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getBills", {});
          setBills((res.bills || []).map(mapBillFromApi));
          showToast("Bills generated", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },

      saveAdjustment: async (billIdArg, amountArg, reasonArg) => {
        const { billId, amount, reason } = getAdjustmentData(billIdArg, amountArg, reasonArg);
        if (!billId || !amount || !reason) {
          showToast("Fill all fields", "error");
          return;
        }
        try {
          const payload = {
            billId,
            amount: Number(amount),
            reason,
            idempotencyKey: Date.now().toString(),
          };
          await callApi("addAdjustment", payload);
          showToast("Added", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getAdjustments", {});
          setAdjustments((res.adjustments || []).map(mapAdjustmentFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    };
  }, [customers, setBills, setAdjustments, showToast, closeModal, form, modal]);

  // 3. Import Handlers
  const importHandlers = useMemo(
    () => ({
      addMilkImport: async (formArg) => {
        const f = formArg || form;
        try {
          const payload = mapImportToApi(f);
          await callApi("addMilkImport", payload);
          showToast("Import added", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getMilkImports", {});
          setImports((res.imports || []).map(mapImportFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      updateMilkImport: async (formArg) => {
        const f = formArg || form;
        try {
          const payload = mapImportToApi(f);
          await callApi("updateMilkImport", payload);
          showToast("Import updated", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getMilkImports", {});
          setImports((res.imports || []).map(mapImportFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [setImports, showToast, closeModal, form],
  );

  // 4. Delivery Handlers
  const deliveryHandlers = useMemo(
    () => ({
      toggleDeliveryLog: async (logId, delivered) => {
        try {
          const payload = {
            logId,
            delivered,
            date: getToday(),
            idempotencyKey: Date.now().toString(),
          };
          await callApi("updateLogEntry", payload);
          showToast("Log updated", "success");
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getDailyLogs", { date: getToday() });
          setLogs((res.logs || []).map(mapLogFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      bulkUpsertLogs: async (logsToUpsert) => {
        try {
          const payload = {
            logs: logsToUpsert,
            idempotencyKey: Date.now().toString(),
          };
          await callApi("bulkUpsertLogs", payload);
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getDailyLogs", { date: getToday() });
          setLogs((res.logs || []).map(mapLogFromApi));
          showToast("Logs saved", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [setLogs, showToast],
  );

  // 5. Admin / Misc Handlers
  const adminHandlers = useMemo(
    () => ({
      addPause: async (customerId, startDate, endDate, reason) => {
        try {
          const payload = {
            customerId,
            startDate,
            endDate,
            reason,
            idempotencyKey: Date.now().toString(),
          };
          await callApi("addPausePeriod", payload);
          showToast("Pause added", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getPauses", {});
          setPauses((res.pauses || []).map(mapPauseFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      addBrand: async (brandName) => {
        try {
          const payload = { brandName, idempotencyKey: Date.now().toString() };
          await callApi("addMilkBrand", payload);
          showToast("Brand added", "success");
          if (closeModal) closeModal();
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getBrands", {});
          setBrands((res.brands || []).map(mapBrandFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [showToast, closeModal, setPauses, setBrands],
  );

  // 6. Dispatch helpers
  const saveCustomer = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      const validationError = validateCustomerForm(f);
      if (validationError) {
        showToast(validationError, "error");
        return;
      }
      if (f.id) {
        return customerHandlers.updateCustomer(f);
      }
      return customerHandlers.addCustomer(f);
    },
    [customerHandlers, form, showToast], // ✅ Added showToast to deps
  );

  const saveImport = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      const validationError = validateImportForm(f);
      if (validationError) {
        showToast(validationError, "error");
        return;
      }
      if (f.id) {
        return importHandlers.updateMilkImport(f);
      }
      return importHandlers.addMilkImport(f);
    },
    [importHandlers, form, showToast], // ✅ Added showToast to deps
  );

  const savePause = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      return adminHandlers.addPause(
        f.custId || modal.data?.custId,
        f.startDate,
        f.endDate,
        f.reason,
      );
    },
    [adminHandlers, form, modal],
  );

  const saveBrand = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      const brandName =
        f.name ||
        f.brandName ||
        modal.data?.name ||
        modal.data?.brandName ||
        "";
      if (!brandName || !String(brandName).trim()) {
        showToast("Brand name is required", "error");
        return;
      }
      try {
        await callApi("addMilkBrand", {
          brandName: brandName.trim(),
          supplierName: f.supplier,
          supplierPhone: f.phone,
          defaultMilkType: f.defaultType,
          ratePerLiter:
            f.rate !== undefined && f.rate !== "" ? Number(f.rate) : undefined,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        });
        showToast("Brand added", "success");
        if (closeModal) closeModal();
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getBrands", {});
        setBrands((res.brands || []).map(mapBrandFromApi));
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    [setBrands, showToast, closeModal, form, modal],
  );

  // 7. Subscription Handlers
  const saveSubscription = useCallback(
    async (data) => {
      try {
        const payload = { ...data };
        if (data.id) {
          payload.expectedVersion = data.version;
        } else {
          payload.idempotencyKey = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }

        await callApi("saveSubscription", payload);
        showToast("Subscription saved", "success");
        if (closeModal) closeModal();
        
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getSubscriptions", {});
        setSubscriptions((res.subscriptions || []).map(mapSubscriptionFromApi));
      } catch (err) {
        showToast(err.message || "Failed to save subscription", "error");
      }
    },
    [setSubscriptions, showToast, closeModal],
  );

  const generateDailyLogs = useCallback(
    async (date) => {
      try {
        const idempotencyKey = `gen-logs-${date}-${Date.now()}`;
        const summary = await callApi("generateDailyLogsForDate", {
          date,
          idempotencyKey,
        });

        const skipped =
          (summary.skippedExisting || 0) +
          (summary.skippedPaused || 0) +
          (summary.skippedWrongDay || 0) +
          (summary.skippedInactiveCust || 0);

        showToast(
          `Generated ${summary.created} logs. Skipped ${skipped}.`,
          summary.created > 0 ? "success" : "info",
        );

        if (state.fetchLogs) {
          await state.fetchLogs(date);
        }
      } catch (err) {
        showToast(err.message || "Failed to generate logs", "error");
      }
    },
    [showToast, state],
  );

  // 8. Bill lifecycle
  const lockBill = useCallback(
    async (billId) => {
      try {
        await callApi("lockBill", { billId });
        showToast("Bill locked", "success");
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getBills", {});
        setBills((res.bills || []).map(mapBillFromApi));
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    [setBills, showToast],
  );

  const unlockBill = useCallback(
    async (billId) => {
      try {
        await callApi("unlockBill", { billId });
        showToast("Bill unlocked", "success");
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getBills", {});
        setBills((res.bills || []).map(mapBillFromApi));
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    [setBills, showToast],
  );

  // 9. WhatsApp share
  const whatsapp = useCallback(
    async (phone, billId) => {
      if (!phone) {
        showToast("No phone number on file", "error");
        return;
      }
      const digits = String(phone).replace(/\D/g, "");
      const intlPhone = digits.length === 10 ? "91" + digits : digits;
      if (!intlPhone) {
        showToast("Invalid phone number", "error");
        return;
      }
      let text = `Pending milk bill — Bill ${billId}`;
      if (billId) {
        try {
          const data = await callApi("getBillText", { billId });
          if (data?.text) text = data.text;
        } catch {
          // keep the fallback text
        }
      }
      const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
      // cspell:disable-next-line
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [showToast],
  );

  const addAdHocLog = useCallback(
    async (data) => {
      try {
        await callApi("addAdHocLog", {
          ...data,
          idempotencyKey: `adhoc-${Date.now()}`,
        });
        showToast("Extra delivery added", "success");
        if (closeModal) closeModal();
        if (state.fetchLogs) await state.fetchLogs(data.date);
      } catch (err) {
        showToast(err.message || "Failed to add extra delivery", "error");
      }
    },
    [showToast, closeModal, state],
  );

  const addCreditNote = useCallback(
    async (data) => {
      try {
        await callApi("addCreditNote", data);
        showToast("Credit note issued", "success");
        if (closeModal) closeModal();
        if (state.refresh) state.refresh();
      } catch (err) {
        showToast(err.message || "Failed to issue credit note", "error");
      }
    },
    [showToast, closeModal, state],
  );

  const fetchSubscriptionHistory = useCallback(
    async (subscriptionId) => {
      try {
        const res = await callApi("getSubscriptionHistory", { subscriptionId });
        return res.history || [];
      } catch (err) {
        showToast(err.message || "Failed to load history", "error");
        return [];
      }
    },
    [showToast],
  );

  // 10. Import Lifecycle
  const confirmMilkImport = useCallback(
    async (importId) => {
      try {
        await callApi("confirmMilkImport", { importId });
        showToast("Import confirmed", "success");
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch (err) {
        showToast(err.message || "Failed to confirm import", "error");
      }
    },
    [showToast, setImports], // ✅ Added showToast to deps
  );

  const deleteMilkImport = useCallback(
    async (importId) => {
      try {
        await callApi("deleteMilkImport", { importId });
        showToast("Import deleted", "success");
        // ✅ REFRESH FROM SERVER
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch (err) {
        showToast(err.message || "Failed to delete import", "error");
      }
    },
    [showToast, setImports], // ✅ Added showToast to deps
  );

  // 11. Adjustment Lifecycle
  const applyAdjustment = useCallback(
    async (adjustmentId, billId) => {
      try {
        await callApi("applyAdjustment", { adjustmentId, billId });
        showToast("Adjustment applied", "success");

        // ✅ REFRESH BOTH ADJUSTMENTS AND BILLS FROM SERVER
        const [adjRes, billRes] = await Promise.all([
          callApi("getAdjustments", {}),
          callApi("getBills", {}),
        ]);
        setAdjustments((adjRes.adjustments || []).map(mapAdjustmentFromApi));
        setBills((billRes.bills || []).map(mapBillFromApi));
      } catch (err) {
        showToast(err.message || "Failed to apply adjustment", "error");
      }
    },
    [showToast, setAdjustments, setBills],
  );

  return useMemo(
    () => ({
      ...customerHandlers,
      ...billingHandlers,
      ...importHandlers,
      ...deliveryHandlers,
      ...adminHandlers,
      saveCustomer,
      saveImport,
      savePause,
      saveBrand,
      lockBill,
      unlockBill,
      whatsapp,
      saveSubscription,
      generateDailyLogs,
      addAdHocLog,
      addCreditNote,
      fetchSubscriptionHistory,
      confirmMilkImport,
      deleteMilkImport,
      applyAdjustment,
    }),
    [
      customerHandlers,
      billingHandlers,
      importHandlers,
      deliveryHandlers,
      adminHandlers,
      saveCustomer,
      saveImport,
      savePause,
      saveBrand,
      lockBill,
      unlockBill,
      whatsapp,
      saveSubscription,
      generateDailyLogs,
      addAdHocLog,
      addCreditNote,
      fetchSubscriptionHistory,
      confirmMilkImport,
      deleteMilkImport,
      applyAdjustment,
    ],
  );
}