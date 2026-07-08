import { useMemo, useCallback } from "react";
import { mapImportToApi, mapImportFromApi, callApi } from "../../lib/api.js";
import { validateImportForm } from "../../lib/validation.js";
import { useHelpers } from "./shared.js";

export function useImportHandlers(state) {
  const { setImports } = state;
  const { handleFormAction, saveWithValidation, showToast } = useHelpers(state);

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
          "imports",
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
          "imports",
        ),
    }),
    [setImports, handleFormAction],
  );

  const saveImport = useCallback(
    (formArg) =>
      saveWithValidation(
        formArg,
        validateImportForm,
        importHandlers,
        "MilkImport",
      ),
    [saveWithValidation, importHandlers],
  );

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

  const confirmMilkImport = useCallback(
    async (importId) =>
      handleImportAction(
        "confirmMilkImport",
        importId,
        "Import confirmed",
        "Failed to confirm import",
      ),
    [handleImportAction],
  );

  const deleteMilkImport = useCallback(
    async (importId) =>
      handleImportAction(
        "deleteMilkImport",
        importId,
        "Import deleted",
        "Failed to delete import",
      ),
    [handleImportAction],
  );

  return { ...importHandlers, saveImport, confirmMilkImport, deleteMilkImport };
}
