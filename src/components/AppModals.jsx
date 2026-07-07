import { MILK_TYPES, PRODUCTS, PAY_MODES } from "../lib/constants.js";
import {
  CustomerModal,
  ImportModal,
  PaymentModal,
  BillDetailModal,
  AdjustmentModal,
  PauseModal,
  BrandModal,
  SubscriptionModal,
  SubscriptionsListModal,
  SubscriptionHistoryModal,
  AdHocLogModal,
  CreditNoteModal,
} from "./forms.jsx";

function renderCustomerModal(ctx, isEdit) {
  return (
    <CustomerModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.handlers.saveCustomer}
      isEdit={isEdit}
      onClose={ctx.closeModal}
      products={PRODUCTS}
    />
  );
}

function renderImportModal(ctx) {
  return (
    <ImportModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.handlers.saveImport}
      onClose={ctx.closeModal}
      today={ctx.today}
      brands={ctx.brands}
      milkTypes={MILK_TYPES}
    />
  );
}

function renderPaymentModal(ctx) {
  return (
    <PaymentModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.handlers.recordPayment}
      onClose={ctx.closeModal}
      today={ctx.today}
      payModes={PAY_MODES}
      customers={ctx.customers}
    />
  );
}

function renderAdjustmentModal(ctx) {
  return (
    <AdjustmentModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.handlers.saveAdjustment}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
    />
  );
}

function renderPauseModal(ctx) {
  return (
    <PauseModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.handlers.savePause}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
    />
  );
}

function renderSubscriptionModal(ctx) {
  return (
    <SubscriptionModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      // Merge form data with ID/Version for Optimistic Concurrency Control if editing
      onSave={() =>
        ctx.handlers.saveSubscription({
          ...ctx.form,
          id: ctx.modal.data?.id,
          version: ctx.modal.data?.version,
        })
      }
      onClose={ctx.closeModal}
      customers={ctx.customers || []}
    />
  );
}

const MODAL_RENDERERS = {
  addCustomer: (ctx) => renderCustomerModal(ctx, false),
  editCustomer: (ctx) => renderCustomerModal(ctx, true),
  addImport: renderImportModal,
  payment: renderPaymentModal,
  billDetail: (ctx) => (
    <BillDetailModal
      data={ctx.modal.data}
      onClose={ctx.closeModal}
      customers={ctx.customers}
    />
  ),
  addAdj: renderAdjustmentModal,
  addPause: renderPauseModal,
  addBrand: (ctx) => (
    <BrandModal
      form={ctx.form}
      onChange={ctx.setF}
      onSave={ctx.handlers.saveBrand}
      onClose={ctx.closeModal}
      milkTypes={MILK_TYPES}
    />
  ),
  addAdHoc: (ctx) => (
    <AdHocLogModal
      form={ctx.form}
      onChange={ctx.setF}
      onSave={() => ctx.handlers.addAdHocLog(ctx.form)}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
    />
  ),
  addCreditNote: (ctx) => (
    <CreditNoteModal
      form={ctx.form}
      onChange={ctx.setF}
      onSave={() => ctx.handlers.addCreditNote(ctx.form)}
      onClose={ctx.closeModal}
      customers={ctx.customers}
    />
  ),
  subscriptionHistory: (ctx) => (
    <SubscriptionHistoryModal
      data={ctx.modal.data}
      onClose={ctx.closeModal}
      handlers={ctx.handlers}
    />
  ),
  // ── SUBSCRIPTION MODALS ────────────────────────────────────────────────
  subscriptionsList: (ctx) => (
    <SubscriptionsListModal
      subscriptions={ctx.subscriptions || []}
      // fallow-ignore-next-line complexity
      onEdit={(sub) => {
        // Initialize form with defaults for new, or existing data for edit
        if (ctx.setForm) {
          ctx.setForm(
            sub
              ? { ...sub }
              : {
                  isActive: true,
                  deliveryDays: [1, 2, 3, 4, 5],
                  quantity: 1,
                  milkType: "FULL_CREAM",
                },
          );
        }
        // Open the correct modal type
        if (ctx.openModal) {
          ctx.openModal(sub ? "editSubscription" : "addSubscription");
        }
      }}
      onViewHistory={(sub) => ctx.openModal("subscriptionHistory", sub)}
      onClose={ctx.closeModal}
    />
  ),
  addSubscription: renderSubscriptionModal,
  editSubscription: renderSubscriptionModal,
};

export function AppModals(props) {
  if (!props.modal) return null;
  const render = MODAL_RENDERERS[props.modal.type];
  return render ? render(props) : null;
}
