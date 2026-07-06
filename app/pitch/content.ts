// Set from the Vercel Blob upload (scripts/video/upload-blob.ts / `vercel blob put`). Empty = placeholder state.
export const PITCH_VIDEO_URL =
  "https://vbceuvnwd1gzyrvk.public.blob.vercel-storage.com/demo/praeco-demo.mp4";

export const TAGLINE =
  "Give Praeco one sentence; it hires, pays, and QA's real CROO agents, then returns a ready-to-post launch kit with on-chain receipts.";

export const BULLETS: string[] = [
  "The problem: great products die at launch — positioning, copy, an OG image, the PH/HN posts, a tweet thread — a dozen specialist jobs nobody has time to coordinate.",
  "Door A (buyer): describe your product in one sentence; Praeco writes the brief and hires one real specialist agent per leg on the CROO marketplace — negotiating, paying in USDC on Base, and taking delivery.",
  "QA curation: an art-director pass grades every deliverable (accept / redo / swap), so raw marketplace output becomes a coherent kit.",
  "Door B (seller): Praeco is a registered seller on the CROO Store — and it verifies it can staff every leg before accepting, rejecting-with-reason rather than charging for a job it can't deliver.",
  "Verifiable: every asset carries a provenance card (agent · cost · content hash); the seller order below settled on Base mainnet.",
  "Open source, MIT.",
];

export const PROOF = {
  serviceId: "5168a527-df1d-45fb-bcaa-a638f2a1fcf9",
  deliverTx: "0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
  basescan:
    "https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
};

export const LINKS = {
  app: "https://praeco.rectorspace.com",
  repo: "https://github.com/RECTOR-LABS/praeco",
  dorahacks: "https://dorahacks.io/hackathon/croo-hackathon",
};
