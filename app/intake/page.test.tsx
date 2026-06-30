// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Intake from "./page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  (globalThis as any).fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ runId: "run-1" }), { status: 200 }),
  );
});

it("posts a sandbox run and routes to the theater", async () => {
  render(<Intake />);
  await userEvent.type(
    screen.getByPlaceholderText(/one-liner or github/i),
    "https://github.com/a/b",
  );
  await userEvent.click(screen.getByRole("button", { name: /try it free|run/i }));
  expect((globalThis as any).fetch).toHaveBeenCalledWith(
    "/api/runs",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "sandbox", repoUrl: "https://github.com/a/b" }),
    }),
  );
  expect(mockPush).toHaveBeenCalledWith("/run/run-1");
});
