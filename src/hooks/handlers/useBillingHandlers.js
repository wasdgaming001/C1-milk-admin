import { useMemo, useCallback } from "react";
import {
  mapBillFromApi,
  mapAdjustmentFromApi,
  mapPaymentToApi,
  callApi,
} from "../../lib/api.js";
import { getToday } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useBillingHandlers(state) {
  const {
    customers,
    setBills,
    setAdjustments,
    form = {},
    modal = {},
    closeModal,
  } = state;
  const { showToast, handleIdAction } = useHelpers(state);

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
          const payload = mapPaymentToApi(billId, amount, {
            mode: form.payMode,
            date: form.payDate,
            note: form.payNote,
          });
          await callApi("recordPayment", payload);
          showToast(`₹${amount} recorded`, "success");
          if (closeModal) closeModal();
          const res = await callApi("getBills", {});
          setBills((res.bills || []).map(mapBillFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      generateMonthlyBills: async (month) => {
        try {
          const activeCustomers = customers.filter(
            (c) => c.status === "Active",
          );
          for (const c of activeCustomers) {
            await callApi("generateMonthBill", {
              customerId: c.id,
              month,
            }).catch(() => {});
          }
          const res = await callApi("getBills", {});
          setBills((res.bills || []).map(mapBillFromApi));
          showToast("Bills generated", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      saveAdjustment: async (billIdArg, amountArg, reasonArg) => {
        const { billId, amount, reason } = getAdjustmentData(
          billIdArg,
          amountArg,
          reasonArg,
        );
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
          const res = await callApi("getAdjustments", {});
          setAdjustments((res.adjustments || []).map(mapAdjustmentFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    };
  }, [customers, setBills, setAdjustments, showToast, closeModal, form, modal]);

  const billLockHandlers = useMemo(
    () => ({
      lockBill: (billId) =>
        handleIdAction(
          "lockBill",
          "billId",
          billId,
          "Bill locked",
          "getBills",
          setBills,
          mapBillFromApi,
          "bills",
        ),
      unlockBill: (billId) =>
        handleIdAction(
          "unlockBill",
          "billId",
          billId,
          "Bill unlocked",
          "getBills",
          setBills,
          mapBillFromApi,
          "bills",
        ),
    }),
    [handleIdAction, setBills],
  );

  const applyAdjustment = useCallback(
    async (adjustmentId, billId) => {
      try {
        await callApi("applyAdjustment", { adjustmentId, billId });
        showToast("Adjustment applied", "success");
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

  return {
    ...billingHandlers,
    ...billLockHandlers,
    applyAdjustment,
    addCreditNote,
    whatsapp,
  };
}
