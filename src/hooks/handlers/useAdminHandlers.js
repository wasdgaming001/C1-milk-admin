import { useMemo, useCallback } from "react";
import { mapPauseFromApi, mapBrandFromApi, callApi } from "../../lib/api.js";
import { useHelpers } from "./shared.js";

export function useAdminHandlers(state) {
  const { setPauses, setBrands, form = {}, modal = {}, closeModal } = state;
  const { showToast, executeApiAction } = useHelpers(state);

  const adminHandlers = useMemo(
    () => ({
      addPause: async (customerId, startDate, endDate, reason) => {
        const payload = {
          customerId,
          startDate,
          endDate,
          reason,
          idempotencyKey: Date.now().toString(),
        };
        return executeApiAction(
          "addPausePeriod",
          payload,
          "Pause added",
          "getPauses",
          setPauses,
          mapPauseFromApi,
          "pauses",
        );
      },
      addBrand: async (brandName) => {
        const payload = { brandName, idempotencyKey: Date.now().toString() };
        return executeApiAction(
          "addMilkBrand",
          payload,
          "Brand added",
          "getBrands",
          setBrands,
          mapBrandFromApi,
          "brands",
        );
      },
    }),
    [executeApiAction, setPauses, setBrands],
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
        const res = await callApi("getBrands", {});
        setBrands((res.brands || []).map(mapBrandFromApi));
      } catch (err) {
        showToast(err.message, "error");
      }
    },
    [setBrands, showToast, closeModal, form, modal],
  );

  return { ...adminHandlers, savePause, saveBrand };
}
