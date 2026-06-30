// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Landing from "./page";

vi.mock("@/server/persistence", () => ({
  listRecords: vi.fn(async () => []),
}));

test("landing renders the brand", async () => {
  render(await Landing());
  expect(screen.getByRole("heading", { name: "Praeco" })).toBeInTheDocument();
});
