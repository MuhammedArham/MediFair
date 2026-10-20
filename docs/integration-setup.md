# Installation and integration setup

## Install and run locally

Use Node.js 22 LTS (22.18.0 was tested) and pnpm 11.25.0. From the project root:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Open http://127.0.0.1:3000. Defaults are `EMAIL_TRANSPORT=mock`, `AI_PROVIDER=mock`, `DEMO_MODE=true`. A local PostgreSQL database is required. Set `DATABASE_URL` in `.env.local`; `DIRECT_URL` is optional if the runtime URL uses a pooler. Both Next.js and Prisma CLI read `.env.local`; process variables take precedence. Prisma 7 uses `@prisma/adapter-pg` at runtime. Historical SQLite is retained only for deterministic repository tests.

`pnpm db:seed` restores only the canonical sample case while preserving unrelated cases and the shared catalogue. `pnpm db:reset` clears that sample case; run seed to restore it. The Settings reset performs both operations after confirmation.

## Automated checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

The browser installer is a one-time tooling download, not a product API call. Alternatively use an already installed Chrome with `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`. E2E tests require `E2E_DATABASE_URL` pointing to a dedicated local database named `medifair_e2e`. Setup resets only that database, applies PostgreSQL migrations and seeds it, then bind to 127.0.0.1:3100, blank both API keys and force mock providers. Browser requests to external hosts are blocked. Close any other dev server for this repository first; Next uses one development lock. Browser reports and traces are ignored by Git.

Production requires `APP_ACCESS_USERNAME` and a long `APP_ACCESS_PASSWORD`. This Basic-auth gate protects the single-operator synthetic demo; it is not patient account authentication. `/dev/email-simulator` and Reset Demo remain disabled in production. Do not enter real patient data.

## Real adapters and controlled integration tests

Add future values to **`.env.local` in the project root**, never source files or committed configuration. Keep mock mode until ready for a deliberate integration test.

- `EMAIL_TRANSPORT=resend`: requires `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_INBOUND_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `APP_BASE_URL`, and exact comma-separated `DEMO_ALLOWED_RECIPIENTS` for demo sending.
- Verify an owned sending domain in the Resend dashboard using the supplied DNS records. Enable receiving on the chosen inbound domain/address. A bare verified From address is required. The sender performs domain checks; presence of environment values does not establish verification.
- Register `/api/resend/webhook` for inbound and delivery events. The handler verifies the raw payload and signature with the SDK, retrieves received email content via the receiving API, matches opaque reply tokens, and deduplicates events. Mock mode disables this route.
- Use only controlled, user-verified test recipients. `.example` fixture addresses cannot be sent through Resend. Approval binds the exact recipient, subject and body; sending is always separate.
- `AI_PROVIDER=openai`: requires `OPENAI_API_KEY` and an explicitly configured `OPENAI_MODEL` with Structured Outputs support. No model identifier is assumed. Demo extraction sends checked-in synthetic content only. Real patient processing remains disabled pending authorisation/privacy work.
- Unknown provider modes and missing credentials fail closed. Real errors never trigger a silent switch to mock.

References retained from adapter implementation: https://resend.com/docs/send-with-nextjs, https://resend.com/docs/dashboard/domains/introduction, https://resend.com/features/inbound, https://resend.com/docs/webhooks/introduction. SDK mocks verify request construction and failure handling. See `docs/test-results.md` for separately recorded live checks; configuration presence alone does not verify account permissions, DNS, actual delivery or webhook routing.

## Preparing a Vercel deployment (do not deploy before review)

1. Provision a PostgreSQL database you control, with a pooled `DATABASE_URL` suitable for Prisma's `pg` adapter. Set `DIRECT_URL` as well if your provider requires a direct, non-pooler connection for migrations. The old SQLite data is synthetic; this repository provides a fresh PostgreSQL baseline, not a live SQLite data import. Keep credentials in Vercel environment settings and in ignored `.env.local` for local work.
2. Connect a **Private** Vercel Blob store to the project. With OIDC authentication, Vercel supplies `BLOB_STORE_ID` and a rotating `VERCEL_OIDC_TOKEN` to Functions; `@vercel/blob` uses them automatically. A legacy `BLOB_READ_WRITE_TOKEN` also works when supplied, but is not required for OIDC. Set `DOCUMENT_STORAGE=vercel-blob` in production or omit it for the production default. Do not use a public Blob store for medical documents. Local development defaults to private `.private-documents/` storage.
3. Set Node.js 22.x for the Vercel project. Install with `pnpm install --frozen-lockfile`, build with `pnpm build`. Prisma Client 7 is generated at postinstall and build. Run `pnpm db:deploy` with the target database URL as a separate release/migration step before allowing traffic. Do not run `prisma migrate dev` against production.
4. Set `APP_ACCESS_USERNAME` and a unique `APP_ACCESS_PASSWORD` of at least 16 characters. This HTTP Basic gate is only for a single operator testing synthetic cases. The app fails closed if absent. Browser access must use HTTPS. Simulator and Reset Demo remain unavailable on Vercel.
5. Keep `DEMO_MODE=true`, `EMAIL_TRANSPORT=mock`, `AI_PROVIDER=mock` initially. Mock sending is database-only and never external delivery. When explicitly testing real adapters later, set Resend and OpenAI values below, verify a Resend sending/receiving domain, register the signed webhook at `${APP_BASE_URL}/api/resend/webhook`, and use only addresses in `DEMO_ALLOWED_RECIPIENTS`. No actual patient data may be sent.

Vercel environment variables for the **mock deployment**: `DATABASE_URL`, `BLOB_STORE_ID` (for OIDC Blob), `APP_ACCESS_USERNAME`, `APP_ACCESS_PASSWORD`, `DEMO_MODE=true`, `EMAIL_TRANSPORT=mock`, `AI_PROVIDER=mock`, `DOCUMENT_STORAGE=vercel-blob`, and `APP_BASE_URL`; optional `DIRECT_URL` for migrations. `VERCEL_OIDC_TOKEN` is managed by Vercel, not manually created or committed. For **real adapter tests later**, additionally set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_INBOUND_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `DEMO_ALLOWED_RECIPIENTS`, `OPENAI_API_KEY`, and `OPENAI_MODEL`, then change the adapter mode values deliberately. Never expose server secrets with `NEXT_PUBLIC_`.

The Vercel Function upload/body limit is 4.5 MB; this app caps PDFs at 4 MB to leave room for multipart overhead. The private PDF download endpoint requires the same workspace access gate. Raw Resend webhooks run in Node.js, verify signatures, and persist through the normal inbound/quote/negotiation pipeline. A live provider/database/blob integration test remains a separate manual validation step.

Official references: [Prisma PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Prisma migrate deploy](https://www.prisma.io/docs/orm/prisma-migrate/workflows/deploying-database-changes), [Vercel private Blob](https://vercel.com/docs/vercel-blob/private-storage), [Vercel Function limits](https://vercel.com/docs/functions/limitations).


## Resend without purchasing a domain — restricted account test

Verified against official Resend documentation on 20 October 2026. The shared `onboarding@resend.dev` sender can send only to the Resend account owner's email. This is a restricted integration test, not a verified custom sending domain. A `vercel.app` application hostname can host the webhook but does not give the operator DNS control of the email domain. For ordinary specialist-practice sending, use a domain whose DNS you control and complete Resend verification.

In Vercel → medifair-ai → Settings → Environment Variables → **Production**, set:

| Variable | Value / purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret; dedicated account key with receiving access. A sending-only key cannot retrieve received content. |
| `RESEND_WEBHOOK_SECRET` | Secret; signing secret of this application's registered webhook. |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` for this restricted test only. |
| `RESEND_INBOUND_ADDRESS` | `replies@<account-id>.resend.app`, using the managed receiving domain displayed in your Resend account. |
| `RESEND_TEST_RECIPIENT` | The controlled account-owner inbox; explicit test-sender opt-in. |
| `DEMO_ALLOWED_RECIPIENTS` | Exactly the same single address as `RESEND_TEST_RECIPIENT`. Multiple addresses fail configuration validation in restricted test mode. |
| `DEMO_MODE` | `true` |
| `AI_PROVIDER` | `mock` to avoid paid AI calls during email testing. Existing OpenAI secrets may remain stored. |
| `EMAIL_TRANSPORT` | Keep `mock` while preparing secrets. Deliberately change to `resend` and redeploy only when ready. |
| `APP_BASE_URL` | The existing HTTPS production application URL. |

Register `${APP_BASE_URL}/api/resend/webhook` for `email.received`, `email.delivered`, `email.bounced` and `email.failed`. The application access gate exempts only this endpoint; raw-body SDK signature validation remains mandatory. Platform-level Deployment Protection must also permit this webhook URL; never disable protection of other private routes. `mock` email mode returns 404 for webhooks.

Create a separate consenting fictional case and a user-verified test contact owned by that case using the controlled inbox. Never change the three `.example` practice fixture recipients into real recipients. Approve the exact recipient, subject and body, then separately send once. Receiving through Resend does not make the synthetic case real patient data: `EmailMessage.isSimulation` preserves actual transport provenance, while quote and line-item `isFictional` follows the consenting synthetic case. Unfamiliar/edited messages still require manual review; mock AI recognises exact fixtures only. Real OpenAI in demo mode retains its fixture-only external-transmission restriction.

The Free plan currently includes 3,000 emails/month and 100/day; sent and received messages count towards quota. No paid plan or pay-as-you-go is required for a few controlled tests. These are provider limits, not a guarantee of zero hosting or AI cost. Do not purchase a domain, upgrade a plan or enable automatic overage billing during this test.

Sources: [Resend API restrictions](https://resend.com/docs/api-reference/errors), [managed receiving domain](https://resend.com/docs/dashboard/receiving/introduction), [Resend pricing](https://resend.com/pricing). Live send/delivery/receiving and negotiation interoperability remain unverified until separately recorded in `docs/test-results.md`.
