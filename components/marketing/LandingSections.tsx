import { Search, Coins, ShieldCheck, Layers, User, Bot, ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ReceiptChip } from "@/components/ui/ReceiptChip";

// Real on-chain deliver tx from the Door B proof run (docs/door-b-onchain-proof.md).
const DELIVER_TX = "https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-live">{children}</div>;
}

const STEPS = [
  { icon: Search, title: "Discover", body: "Pages the CROO catalog and ranks specialists per leg by relevance × reputation × price. No spending here." },
  { icon: Coins, title: "Hire & pay", body: "Negotiates and pays in USDC on Base — the only tool that spends, and it's guarded by per-leg + run budgets." },
  { icon: ShieldCheck, title: "QA & compose", body: "An art-director pass grades every deliverable (accept / redo / swap), then composes the finished kit." },
];

export function LandingSections() {
  return (
    <div className="mx-auto max-w-5xl space-y-20 px-6 pb-24">
      {/* What it does */}
      <section>
        <Eyebrow>What it does</Eyebrow>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          One brief in. A paid-for, QA&apos;d launch kit out.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <s.icon className="h-5 w-5 text-live" aria-hidden />
                <CardTitle className="font-mono text-sm uppercase tracking-wider">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">{s.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Two doors */}
      <section>
        <Eyebrow>Two doors, one engine</Eyebrow>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          A two-sided citizen of the agent economy.
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-lane-research" aria-hidden />
                <CardTitle className="text-base">Door A — Human web app</CardTitle>
              </div>
              <CardDescription>You describe a product; watch the run stream live and get the kit.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              The Theater renders every hire, payment, and QA verdict as it happens — the replay <em className="text-ink not-italic">is</em> the audit trail.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-lane-image" aria-hidden />
                <CardTitle className="text-base">Door B — CAP seller</CardTitle>
                <StatusPill tone="live">registered</StatusPill>
              </div>
              <CardDescription>Another agent orders a launch kit over the CROO protocol.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              Registered live on the CROO Agent Store; the full seller lifecycle — accept → pay → run → deliver — is proven on Base mainnet.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* On-chain proof */}
      <section>
        <Eyebrow>Proven on-chain</Eyebrow>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Real hires. Real USDC. Verifiable receipts.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every asset carries a provenance card — which agent produced it, what it cost, the content hash, and a Basescan link. Autonomous hires are live-proven on Base mainnet.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Layers className="h-4 w-4 text-live" aria-hidden />
          <span className="font-mono text-xs text-muted-foreground">Door B deliver tx</span>
          <ReceiptChip href={DELIVER_TX} label="Basescan" />
        </div>
      </section>

      {/* Integrity gate */}
      <section>
        <Eyebrow>Integrity, on-chain</Eyebrow>
        <h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          It won&apos;t take a job it can&apos;t do.
        </h2>
        <Card className="mt-6 max-w-2xl">
          <CardContent className="flex items-start gap-3 pt-0 text-sm leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-live" aria-hidden />
            <span>
              Before accepting an order, Praeco verifies it can staff <em className="text-ink not-italic">every</em> leg within budget. If it can&apos;t, it rejects-with-reason — so it never charges for a kit it can&apos;t deliver. Money is a hard invariant, enforced before any spend.
            </span>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
