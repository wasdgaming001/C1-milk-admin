import { useCallback } from "react";
import { callApi } from "../../lib/api.js";

export function useHelpers(state) {
  const { toast$, closeModal, form = {} } = state;

  const showToast = useCallback((msg, type) => toast$(msg, type), [toast$]);

  // ✅ NEW: Core execution logic extracted to eliminate duplication
  const executeApiAction = useCallback(
    async (
      action,
      payload,
      successMsg,
      getList,
      setList,
      mapFromApi,
      resKey,
    ) => {
      try {
        await callApi(action, payload);
        showToast(successMsg, "success");
        if (closeModal) closeModal();
        const res = await callApi(getList, {});
        setList((res[resKey] || []).map(mapFromApi));
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [showToast, closeModal],
  );

  const handleFormAction = useCallback(
    async (
      action,
      formArg,
      successMsg,
      mapToApi,
      getList,
      setList,
      mapFromApi,
      resKey,
    ) => {
      const f = formArg || form;
      const payload = mapToApi(f);
      return executeApiAction(
        action,
        payload,
        successMsg,
        getList,
        setList,
        mapFromApi,
        resKey,
      );
    },
    [form, executeApiAction],
  );

  const handleIdAction = useCallback(
    async (
      action,
      idKey,
      id,
      successMsg,
      getList,
      setList,
      mapFromApi,
      resKey,
      fallbackErrMsg,
    ) => {
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

  const saveWithValidation = useCallback(
    async (formArg, validateFn, handlers, entityName) => {
      const f = formArg || form;
      if (!f) return;
      const validationError = validateFn(f);
      if (validationError) {
        showToast(validationError, "error");
        return;
      }
      if (f.id) {
        return handlers[`update${entityName}`](f);
      }
      return handlers[`add${entityName}`](f);
    },
    [form, showToast],
  );

  return {
    showToast,
    executeApiAction,
    handleFormAction,
    handleIdAction,
    saveWithValidation,
  };
}
