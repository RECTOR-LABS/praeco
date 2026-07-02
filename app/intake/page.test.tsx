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
  mockPush.mockClear();
});

it("navigates to the live run stream with a GitHub repo as repoUrl", async () => {
  render(<Intake />);
  await userEvent.type(
    screen.getByPlaceholderText(/one-liner or github/i),
    "https://github.com/a/b",
  );
  await userEvent.click(screen.getByRole("button", { name: /try it free|run/i }));
  const expected =
    "/run/live?" +
    new URLSearchParams({ mode: "sandbox", repoUrl: "https://github.com/a/b" }).toString();
  expect(mockPush).toHaveBeenCalledWith(expected);
});

it("passes free text as text, not repoUrl", async () => {
  render(<Intake />);
  await userEvent.type(
    screen.getByPlaceholderText(/one-liner or github/i),
    "a privacy-first habit tracker",
  );
  await userEvent.click(screen.getByRole("button", { name: /try it free|run/i }));
  const expected =
    "/run/live?" +
    new URLSearchParams({ mode: "sandbox", text: "a privacy-first habit tracker" }).toString();
  expect(mockPush).toHaveBeenCalledWith(expected);
});
