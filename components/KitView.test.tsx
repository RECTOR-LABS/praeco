// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { LaunchKit } from "@/src/types";
import { KitView } from "./KitView";

const base: LaunchKit = {
  landingCopy: "Headline: Streaky", ogImageRef: "hash:0xabc", tweetThread: ["1/ gm"], shortPitch: "pitch",
  phHnBlurb: "blurb", readmePolish: "readme",
  provenance: [{ leg: "research", agentId: "a", agentName: "Foundr", amountUsd: "0.10", contentHash: "0xh", payTxHash: "0xp", basescanUrl: "https://basescan.org/tx/0xp" }],
};
it("renders a provenance card with a Basescan link", () => {
  render(<KitView kit={base} />);
  expect(screen.getByText("Foundr")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /basescan/i })).toHaveAttribute("href", "https://basescan.org/tx/0xp");
});
it("shows a reference card (not a broken img) for a hash ogImageRef", () => {
  render(<KitView kit={base} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText(/asset reference/i)).toBeInTheDocument();
});
it("renders an <img> for a real image url", () => {
  render(<KitView kit={{ ...base, ogImageRef: "https://img.example/og.png" }} />);
  expect(screen.getByRole("img")).toHaveAttribute("src", "https://img.example/og.png");
});
