// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Pitch from "./page";
import { PROOF } from "./content";

test("pitch page renders tagline, the REAL on-chain tx link, and the three CTAs", () => {
  render(<Pitch />);
  expect(screen.getByRole("heading", { name: /give praeco one sentence/i })).toBeInTheDocument();

  const tx = screen.getByRole("link", { name: /verify on basescan/i });
  expect(tx).toHaveAttribute("href", PROOF.basescan);

  expect(screen.getByRole("link", { name: /live app/i })).toHaveAttribute("href", "https://praeco.rectorspace.com");
  expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "https://github.com/RECTOR-LABS/praeco");
  expect(screen.getByRole("link", { name: /dorahacks/i })).toHaveAttribute("href", "https://dorahacks.io/hackathon/croo-hackathon");
});

test("video slot is present (placeholder until the Blob URL is set)", () => {
  render(<Pitch />);
  expect(screen.getByTestId("pitch-video")).toBeInTheDocument();
});
