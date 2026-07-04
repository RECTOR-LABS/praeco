// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";
import { SpendMeter } from "./SpendMeter";
import { PhaseRail } from "./PhaseRail";
import { ReceiptChip } from "./ReceiptChip";

it("StatusPill renders its label", () => {
  render(<StatusPill tone="live">Paid</StatusPill>);
  expect(screen.getByText("Paid")).toBeInTheDocument();
});

it("SpendMeter shows spent and budget", () => {
  render(<SpendMeter spentUsd="0.70" budgetUsd="2.00" />);
  expect(screen.getByText(/\$0\.70/)).toBeInTheDocument();
  expect(screen.getByText(/\$2\.00/)).toBeInTheDocument();
});

it("PhaseRail marks the active segment count", () => {
  const { container } = render(<PhaseRail segments={8} activeIndex={3} />);
  expect(container.querySelectorAll("[data-rail-seg]").length).toBe(8);
});

it("ReceiptChip is an external Basescan link", () => {
  render(<ReceiptChip href="https://basescan.org/tx/0xabc" />);
  const link = screen.getByRole("link", { name: /basescan/i });
  expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xabc");
  expect(link).toHaveAttribute("target", "_blank");
});
