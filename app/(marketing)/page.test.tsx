// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Landing from "./page";
test("landing renders the brand", () => {
  render(<Landing />);
  expect(screen.getByRole("heading", { name: "Praeco" })).toBeInTheDocument();
});
