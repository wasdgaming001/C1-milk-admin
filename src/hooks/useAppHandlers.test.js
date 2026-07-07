import { describe, it, expect, vi } from "vitest";
import { useAppHandlers } from "./useAppHandlers";
import { renderHook, act } from "@testing-library/react";

// ✅ UPDATED: Dynamic mock for callApi and all required mappers
vi.mock("../lib/api.js", () => {
  const callApiMock = vi.fn((action) => {
    // Handle the new "Refetch-from-Server" pattern
    if (action === "getAdjustments")
      return Promise.resolve({ adjustments: [] });
    if (action === "getBills") return Promise.resolve({ bills: [] });
    if (action === "getCustomers") return Promise.resolve({ customers: [] });
    if (action === "getMilkImports") return Promise.resolve({ imports: [] });
    if (action === "getDailyLogs") return Promise.resolve({ logs: [] });
    if (action === "getBrands") return Promise.resolve({ brands: [] });
    if (action === "getPauses") return Promise.resolve({ pauses: [] });
    if (action === "getSubscriptions")
      return Promise.resolve({ subscriptions: [] });

    // Default response for create/update actions
    return Promise.resolve({
      success: true,
      data: { customer: { id: "C123" }, amountPaid: 100, status: "Paid" },
    });
  });

  return {
    callApi: callApiMock,
    // Mappers used by useAppHandlers.js (identity functions for testing)
    mapCustomerToApi: (form) => form,
    mapImportToApi: (form) => form,
    mapPaymentToApi: (id, amt) => ({ billId: id, amountPaid: amt }),
    mapBillFromApi: (b) => b,
    mapCustomerFromApi: (c) => c,
    mapImportFromApi: (i) => i,
    mapLogFromApi: (l) => l,
    mapAdjustmentFromApi: (a) => a,
    mapPauseFromApi: (p) => p,
    mapBrandFromApi: (b) => b,
    mapSubscriptionFromApi: (s) => s,
  };
});

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

  // ✅ FIXED: Use renderHook to properly test React hooks without breaking rules
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

    // ✅ Wrap async state updates in act() to prevent React warnings
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

    expect(toast$).toHaveBeenCalledWith("Fill all fields", "error");
  });
});
