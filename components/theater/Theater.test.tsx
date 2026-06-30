// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { RunRecord } from "@/src/types";
import fixture from "@/test/fixtures/run-completed.json";
import { initialTheaterState, theaterReducer } from "./reducer";
import { Theater } from "./Theater";

const state = (fixture as unknown as RunRecord).worklog.reduce(theaterReducer, initialTheaterState());
it("renders three lanes, the spend meter, and ledger receipts", () => {
  render(<Theater state={state} />);
  expect(screen.getByText(/research/i)).toBeInTheDocument();
  expect(screen.getByText(/og image|image/i)).toBeInTheDocument();
  expect(screen.getByText(/\$0\.70/)).toBeInTheDocument();
  expect(screen.getAllByRole("link").some((a) => a.getAttribute("href")?.includes("basescan"))).toBe(true);
});
