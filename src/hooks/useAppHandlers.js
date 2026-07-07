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
    setPauses, 
    toast$,
    closeModal,
    form = {},
    modal = {},
    logDate,
  } = state;

  const showToast = useCallback((msg, type) => toast$(msg, type), [toast$]);

  // ── Shared Action Helpers ───────────────────────────────────────────────
  const handleFormAction = useCallback(
    async (action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey) => {
      const f = formArg || form;
      try {
        const payload = mapToApi(f);
        await callApi(action, payload);
        showToast(successMsg, "success");
        if (closeModal) closeModal();
        const res = await callApi(getList, {});
        setList((res[resKey] || []).map(mapFromApi));
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [form, closeModal, showToast],
  );

  const handleIdAction = useCallback(
    async (action, idKey, id, successMsg, getList, setList, mapFromApi, resKey, fallbackErrMsg) => {
      try {
        await callApi(action, { [idKey]: id });
        showToast(successMsg, "success");
        const res = await callApi(getList, {});
        setList((res[resKey] || []).map(mapFromApi));
      } catch (err) {
        showToast(fallbackErrMsg || err.message, "error");
      }
    },
    [showToast],
  );

  // 1. Customer Handlers
  const customerHandlers = useMemo(
    () => ({
      addCustomer: async (formArg) =>
        handleFormAction(
          "addCustomer",
          formArg,
          "Customer added",
          mapCustomerToApi,
          "getCustomers",
          setCustomers,
          mapCustomerFromApi,
          "customers"
        ),
      updateCustomer: async (formArg) =>
        handleFormAction(
          "updateCustomer",
          formArg,
          "Customer updated",
          mapCustomerToApi,
          "getCustomers",
          setCustomers,
          mapCustomerFromApi,
          "customers"
        ),
    }),
    [setCustomers, handleFormAction],
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
          const payload = mapPaymentToApi(billId, amount, { mode: form.payMode, date: form.payDate, note: form.payNote });
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
        const customerId = form.custId || modal.data?.custId || billId;
        if (!billId || !amount || !reason) {
          showToast("Fill all fields", "error");
          return;
        }
        try {
          const payload = {
            customerId,
            amount: Number(amount),
            reason,
            date: form.date || getToday(),
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
      addMilkImport: async (formArg) =>
        handleFormAction(
          "addMilkImport",
          formArg,
          "Import added",
          mapImportToApi,
          "getMilkImports",
          setImports,
          mapImportFromApi,
          "imports"
        ),
      updateMilkImport: async (formArg) =>
        handleFormAction(
          "updateMilkImport",
          formArg,
          "Import updated",
          mapImportToApi,
          "getMilkImports",
          setImports,
          mapImportFromApi,
          "imports"
        ),
    }),
    [setImports, handleFormAction],
  );

  // 4. Delivery Handlers
  const deliveryHandlers = useMemo(
    () => ({
      toggleDeliveryLog: async (logId, delivered) => {
        try {
          const viewDate = state.logDate || getToday();
          const payload = {
            logId,
            delivered,
            date: logDate || getToday(),
            idempotencyKey: Date.now().toString(),
          };
          await callApi("updateLogEntry", payload);
          showToast("Log updated", "success");
          // ✅ REFRESH FROM SERVER
          const res = await callApi("getDailyLogs", { date: logDate || getToday() });
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
    [setLogs, showToast, logDate],
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
  // ✅ Combined into a single useMemo to eliminate the 9-line duplication between lock and unlock
  const billLockHandlers = useMemo(() => ({
    lockBill: (billId) => handleIdAction("lockBill", "billId", billId, "Bill locked", "getBills", setBills, mapBillFromApi, "bills"),
    unlockBill: (billId) => handleIdAction("unlockBill", "billId", billId, "Bill unlocked", "getBills", setBills, mapBillFromApi, "bills"),
  }), [handleIdAction, setBills]);

  // 9. WhatsApp share
  const whatsapp = useCallback(
    async (phone, billId) => {
      if (!phone) {
        showToast("No phone number on file", "error");
        return;
      }
      // Fixed typo: changed /D/g to /\D/g to correctly remove non-digit characters
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
  // ✅ Shared helper to eliminate the 9-line duplication between confirm and delete
  const handleImportAction = useCallback(
    async (action, importId, successMsg, fallbackErrMsg) => {
      try {
        await callApi(action, { importId });
        showToast(successMsg, "success");
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch (err) {
        showToast(err.message || fallbackErrMsg, "error");
      }
    },
    [showToast, setImports],
  );

  // ✅ These remain as useCallbacks to preserve the final return block's contract
  const confirmMilkImport = useCallback(
    async (importId) => handleImportAction("confirmMilkImport", importId, "Import confirmed", "Failed to confirm import"),
    [handleImportAction],
  );

  const deleteMilkImport = useCallback(
    async (importId) => handleImportAction("deleteMilkImport", importId, "Import deleted", "Failed to delete import"),
    [handleImportAction],
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
      ...billLockHandlers,
      saveCustomer,
      saveImport,
      savePause,
      saveBrand,
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
      billLockHandlers,
      saveCustomer,
      saveImport,
      savePause,
      saveBrand,
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