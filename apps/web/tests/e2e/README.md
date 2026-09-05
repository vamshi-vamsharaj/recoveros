# Milestone 6 acceptance test

`approval-flow.spec.ts` exercises: open dashboard -> Recovery Cases ->
open a case awaiting approval -> approve it -> confirm the status
updates. It does not fake anything -- it drives the real UI against
the real API.

## One-time setup

```bash
cd apps/web
npm install
npx playwright install chromium
```

## Before running

The API must be running with a seeded database that has at least one
`PENDING_APPROVAL` case:

```bash
# from the repo root
docker compose up -d      # Postgres + Redis
npm run prisma:migrate    # applies the Milestone 6 migration too
npm run prisma:seed
npm run dev:api           # http://localhost:4000
```

`prisma:seed` creates a large payment that crosses
`HUMAN_APPROVAL_AMOUNT_THRESHOLD` (see
`apps/api/src/engine/approval-gate.ts`), which is what gives this test
a case to approve.

## Run

```bash
# from the repo root
npm run test:e2e
```

This starts the Next.js dev server for you (see `playwright.config.ts`
`webServer`) but **not** the API -- that has to already be up, per
above.

## Re-running

Approving the case moves it out of `PENDING_APPROVAL`, so a second run
without reseeding will fail at the "Needs approval" filter step with
no matching rows. Reseed (`npm run prisma:seed` from the repo root)
between runs, or add another large payment through the API before
re-running.
