import { useMemo } from "react";
import { useCustomerHandlers } from "./handlers/useCustomerHandlers";
import { useBillingHandlers } from "./handlers/useBillingHandlers";
import { useImportHandlers } from "./handlers/useImportHandlers";
import { useDeliveryHandlers } from "./handlers/useDeliveryHandlers";
import { useAdminHandlers } from "./handlers/useAdminHandlers";
import { useSubscriptionHandlers } from "./handlers/useSubscriptionHandlers";

export function useAppHandlers(state) {
  // 1. Call the smaller, domain-specific hooks
  const customerHandlers = useCustomerHandlers(state);
  const billingHandlers = useBillingHandlers(state);
  const importHandlers = useImportHandlers(state);
  const deliveryHandlers = useDeliveryHandlers(state);
  const adminHandlers = useAdminHandlers(state);
  const subscriptionHandlers = useSubscriptionHandlers(state);

  // 2. Combine them into the exact same object your UI expects
  return useMemo(
    () => ({
      ...customerHandlers,
      ...billingHandlers,
      ...importHandlers,
      ...deliveryHandlers,
      ...adminHandlers,
      ...subscriptionHandlers,
    }),
    [
      customerHandlers,
      billingHandlers,
      importHandlers,
      deliveryHandlers,
      adminHandlers,
      subscriptionHandlers,
    ],
  );
}
