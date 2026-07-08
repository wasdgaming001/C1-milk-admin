import { useCallback } from "react";
import { mapSubscriptionFromApi, callApi } from "../../lib/api.js";
import { useHelpers } from "./shared.js";

export function useSubscriptionHandlers(state) {
  const { setSubscriptions, closeModal } = state;
  const { showToast } = useHelpers(state);

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

        const res = await callApi("getSubscriptions", {});
        setSubscriptions((res.subscriptions || []).map(mapSubscriptionFromApi));
      } catch (err) {
        showToast(err.message || "Failed to save subscription", "error");
      }
    },
    [setSubscriptions, showToast, closeModal],
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

  return { saveSubscription, fetchSubscriptionHistory };
}
