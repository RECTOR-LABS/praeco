// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Landing from "./page";

vi.mock("@/server/persistence", () => ({
  listRecords: vi.fn(async () => []),
}));

test("landing renders the brand and the hero headline", async () => {
  render(await Landing());
  expect(screen.getByText("Praeco")).toBeInTheDocument(); // nav wordmark
  expect(screen.getByRole("heading", { name: /ship your launch/i })).toBeInTheDocument();
});
