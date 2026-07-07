import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Delivery from "./Delivery";

vi.mock("../hooks/useBusy.js", () => ({
  useBusy: (fn) => [false, fn],
}));

vi.mock("../components/ui.jsx", () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  Field: ({ children, label }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
  IS: () => ({}),
  StatGrid: (props) => <div data-testid="stat-grid" {...props} />,
  Empty: ({ message }) => <div data-testid="empty">{message}</div>,
  Btn: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} data-testid="btn">
      {children}
    </button>
  ),
}));

describe("Delivery Page", () => {
  const mockLogs = [
    { id: "log1", custId: "c1", qty: 2, delivered: false, product: "Cow" },
    { id: "log2", custId: "c2", qty: 1, delivered: true, product: "Buffalo" },
  ];

  const mockCustomers = [
    { id: "c1", name: "Ramesh" },
    { id: "c2", name: "Suresh" },
  ];

  const defaultProps = {
    logDate: "2026-07-04",
    onLogDateChange: vi.fn(),
    todayLogs: mockLogs,
    onToggleLog: vi.fn(),
    fetchLogs: vi.fn(),
    generateDailyLogs: vi.fn(),
    onOpenModal: vi.fn(),
    customers: mockCustomers,
  };

  it("renders the logs and resolves customer names correctly (Tests F6 fix)", () => {
    render(<Delivery {...defaultProps} />);

    // Check if customer names are resolved from the map
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.getByText("Suresh")).toBeInTheDocument();
  });

  it("calls onToggleLog with the correct flipped delivered state when clicked (Tests F5 fix)", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    // The first log is NOT delivered. The button should say "✗ Skip"
    const toggleButton = screen.getByText("✗ Skip");
    await user.click(toggleButton);

    // ✅ CRITICAL: It should call onToggleLog with the log ID and TRUE (flipped from false)
    expect(defaultProps.onToggleLog).toHaveBeenCalledWith("log1", true);
  });

  it("calls generateDailyLogs when the generate button is clicked", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    const generateButton = screen.getByText("⚡ Generate Deliveries");
    await user.click(generateButton);

    expect(defaultProps.generateDailyLogs).toHaveBeenCalledWith("2026-07-04");
  });
});
