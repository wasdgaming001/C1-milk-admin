import { describe, it, expect, vi } from "vitest";
import { useAppHandlers } from "./useAppHandlers";
import { renderHook, act } from "@testing-library/react";

// ✅ FIXED: Added the missing mapping functions to the mock!
vi.mock('../lib/api', () => ({
  callApi: vi.fn(async (action, payload) => {
    // Strict mock: only return success for explicitly handled actions
    const knownActions = [
      'addCustomer', 'updateCustomer', 'deactivateCustomer', 'getCustomers',
      'addPausePeriod', 'updateLogEntry', 'bulkUpsertLogs', 'getDailyLogs',
      'saveSubscription', 'getSubscriptions', 'addAdHocLog', 'generateDailyLogsForDate',
      'generateMonthBill', 'getBills', 'recordPayment', 'addAdjustment',
      'applyAdjustment', 'getAdjustments', 'lockBill', 'unlockBill',
      'addCreditNote', 'getCreditNotes', 'addMilkImport', 'updateMilkImport',
      'getMilkImports', 'getDailyInventory', 'getBrands', 'addMilkBrand',
      'runDiagnostics', 'eraseAllData', 'verifyPIN', 'rotatePIN',
    ];
    
    if (!knownActions.includes(action)) {
      console.warn(`Mock callApi called with unknown action: ${action}`);
      return { success: false, error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` } };
    }
    
    switch (action) {
      case 'addCustomer':
        return { success: true, data: { customerId: payload.idempotencyKey ? 'C-MOCK' : 'C-TEST123' } };
      case 'updateCustomer':
        return { success: true, data: { customerId: payload.customerId, newVersion: (payload.expectedVersion || 1) + 1 } };
      case 'getCustomers':
        return { success: true, data: { customers: [], total: 0, hasMore: false } };
      case 'addAdjustment':
        return { success: true, data: { adjustmentId: 'ADJ-MOCK123' } };
      case 'recordPayment':
        return { success: true, data: { paymentId: 'PAY-MOCK123' } };
      case 'getBills':
        return { success: true, data: { bills: [] } };
      case 'getAdjustments':
        return { success: true, data: { adjustments: [] } };
      default:
        return { success: true, data: {} };
    }
  }),
  
  // ✅ ADDED: Mock the mapping functions so they don't throw "undefined is not a function"
  mapPaymentToApi: vi.fn((billId, amount, meta = {}) => ({
    billId,
    amount: Number(amount),
    mode: meta.mode,
    date: meta.date,
    note: meta.note,
  })),
  mapBillFromApi: vi.fn((bill) => bill),
  mapAdjustmentFromApi: vi.fn((adj) => adj),
}));

function createMockHandlers(overrides = {}) {
  const defaults = {
    bills: [],
    setBills: vi.fn(),
    form: {},
    modal: {},
    toast$: vi.fn(),
    closeModal: vi.fn(),
    customers: [],
    setCustomers: vi.fn(),
    setImports: vi.fn(),
    setLogs: vi.fn(),
    setAdjustments: vi.fn(),
    setPauses: vi.fn(),
    setBrands: vi.fn(),
    setSubscriptions: vi.fn(),
    setQueue: vi.fn(),
    today: "2025-01-15",
    billMonth: "2025-01",
    activeC: [],
    fetchLogs: vi.fn(),
    refresh: vi.fn(),
  };

  const { result } = renderHook(() =>
    useAppHandlers({ ...defaults, ...overrides }),
  );
  return result.current;
}

describe("useAppHandlers - recordPayment", () => {
  it("validates payment amount and updates bill", async () => {
    const setBills = vi.fn();
    const toast$ = vi.fn();
    const closeModal = vi.fn();

    const handlers = createMockHandlers({
      bills: [{ id: "B1", paid: 0, amount: 200 }],
      setBills,
      form: { payAmt: "100", payMode: "Cash" },
      modal: { data: { id: "B1" } },
      toast$,
      closeModal,
    });

    await act(async () => {
      await handlers.recordPayment();
    });

    expect(setBills).toHaveBeenCalled();
    expect(toast$).toHaveBeenCalledWith("₹100 recorded", "success");
    expect(closeModal).toHaveBeenCalled();
  });

  it("rejects invalid payment amount", async () => {
    const toast$ = vi.fn();

    const handlers = createMockHandlers({
      form: { payAmt: "0" },
      toast$,
    });

    await act(async () => {
      await handlers.recordPayment();
    });

    expect(toast$).toHaveBeenCalledWith("Enter valid amount", "error");
  });
});

describe("useAppHandlers - saveAdjustment", () => {
  it("validates and creates adjustment", async () => {
    const setAdjustments = vi.fn();
    const toast$ = vi.fn();
    const closeModal = vi.fn();

    const handlers = createMockHandlers({
      setAdjustments,
      form: { custId: "C1", amount: "50", reason: "Quality issue" },
      customers: [{ id: "C1", name: "Ramesh" }],
      toast$,
      closeModal,
    });

    await act(async () => {
      await handlers.saveAdjustment();
    });

    expect(setAdjustments).toHaveBeenCalled();
    expect(toast$).toHaveBeenCalledWith("Added", "success");
    expect(closeModal).toHaveBeenCalled();
  });

  it("rejects incomplete adjustment data", async () => {
    const toast$ = vi.fn();

    const handlers = createMockHandlers({
      form: { custId: "", amount: "", reason: "" },
      toast$,
    });

    await act(async () => {
      await handlers.saveAdjustment();
    });
    expect(toast$).toHaveBeenCalledWith("Customer ID is missing", "error");
  });
});