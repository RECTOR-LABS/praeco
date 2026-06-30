# Praeco Phase-2 Door A — Railway Deploy Runbook

**Status (2026-06-30):** config ready (`railway.json`, `.env.example`); **live deploy BLOCKED** on Railway free-plan project quota — resolve the blocker, then run the steps below verbatim from the repo root.
**Target:** one long-lived Next.js Node service (`praeco-web`). **Sandbox + replay only**; live (on-chain) mode stays disabled (no `LIVE_RUN_TOKEN`).
**Prereqs:** Railway CLI ≥ 5.23 (`railway --version`), logged in (`railway whoami`).

---

## Blocker — free-plan quota (resolve first)

`railway init --name praeco` → `Free plan resource provision limit exceeded.` Workspace `workspace-1` already holds **conatus** + **quittance**; `praeco` would be the 3rd. Pick one:

- **Free a project** — `railway delete` (or downgrade) an unused project. *Operator decision — conatus/quittance are pre-existing; confirm before deleting.*
- **Upgrade** the Railway plan (Hobby/Pro) for more resources, then proceed.
- **Reuse a project** — deploy `praeco-web` as a service inside conatus/quittance: skip step 1, link that project (`railway link --project <id>`), continue at step 2.

---

## Steps

### 1. Create the project  *(skip if reusing an existing project)*
```bash
railway init --name praeco
```

### 2. Create the web service
```bash
railway add --service praeco-web
```

### 3. Set environment variables — SECRET-SAFE (values never enter shell history)
Run from the repo root with the real `.env` present:
```bash
while IFS='=' read -r key val; do
  case "$key" in
    CROO_API_URL|CROO_WS_URL|CROO_SDK_KEY|BASE_RPC_URL|OLLAMA_API_KEY|OLLAMA_BASE_URL|PRAECO_AGENT_ID|PRAECO_AGENT_WALLET)
      printf '%s' "$val" | railway variable set --stdin "$key" --service praeco-web --skip-deploys >/dev/null && echo "set $key" ;;
  esac
done < .env
railway variable set RUNS_DIR=/data/runs NODE_ENV=production --service praeco-web --skip-deploys
```
Do **not** set `LIVE_RUN_TOKEN` or `SVC_*` — live stays fail-closed; sandbox clears pins. (`--stdin` reads each secret from the pipe, so the command text only ever contains `"$val"`, never the value.)

### 4. Add the persistence volume
```bash
railway volume add -m /data --service praeco-web
```
`RUNS_DIR=/data/runs` lives on this volume so replays survive redeploys.

### 5. Deploy
```bash
railway up --service praeco-web --detach -m "Door A — sandbox + replay"
railway deployment list --service praeco-web --json   # poll until .status == SUCCESS
```
Build config is in `railway.json` (RAILPACK builder, `startCommand: "next start"`, which binds `$PORT`). If auto-detection misbehaves, override:
```bash
railway environment edit --service-config praeco-web build.builder RAILPACK
railway environment edit --service-config praeco-web deploy.startCommand "next start"
```

### 6. Public domain
```bash
railway domain --service praeco-web    # generates a *.up.railway.app URL
```
*(Optional: `railway variable set PUBLIC_BASE_URL=https://<domain> --service praeco-web`, then redeploy, for absolute share links.)*

### 7. Seed a flagship replay
Place one real completed `RunRecord` at `/data/runs/<id>.json` so Landing has a replay on first load — either upload via the Railway dashboard / `railway volume files`, **or** just run one sandbox job on the live URL (it persists its own replay).

### 8. Smoke — don't report success until all pass
- Landing renders (force-dynamic; lists seeded/created replays).
- `/intake?mode=sandbox` → submit a one-liner → the Theater streams 3 lanes + the money ledger to a finished kit (**$0.70, 3 receipts**).
- Toggle replay speed (1×/4×/Skip) on `/replay/<id>` → playback re-paces and the **ledger does NOT double** (the keyed-remount fix).

---

## Notes
- Engine vars are required at **runtime** (`loadConfig` fails fast); the Next build itself doesn't need them.
- **Sandbox** = real GLM-5.2 (Ollama Cloud) + mock CAP, $0, no chain. **Replay** = persisted JSON, $0.
- **Live (on-chain)** is a separate follow-on: set `LIVE_RUN_TOKEN` + `SVC_*` and **top up the agent wallet** (`0xee47…7D31`, ~0.74 USDC) first.
- This is a single in-process service (engine runs in the Next server). Fine at demo scale; a web/worker split is the documented later option.
