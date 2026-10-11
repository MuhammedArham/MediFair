# MediFair AI

A synthetic Australian healthcare quote comparison and bill review workspace. Both journeys run with mock email and simulated AI, without API keys.

## Quick start

With Node.js 22 LTS and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

Set `DATABASE_URL` in the ignored `.env.local` to a PostgreSQL database you control, then open http://127.0.0.1:3000. Keep `EMAIL_TRANSPORT=mock`, `AI_PROVIDER=mock`, `DEMO_MODE=true`.

- [Full demo walkthrough](docs/demo-guide.md)
- [Installation, tests and later API setup](docs/integration-setup.md)
- [Architecture](docs/architecture.md)
- [Australian source registry](docs/australian-sources.md) and [billing rules](docs/australian-billing-rules.md)
- [Test results](docs/test-results.md) and [known limitations](docs/known-limitations.md)

Future keys and addresses go in the ignored **`.env.local` file at the project root**. No credentials are needed now. Real services are implemented but remain externally unverified. A Vercel deployment requires PostgreSQL, private Blob storage and a single-operator access gate. It remains a synthetic demo, not a patient portal.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

With Chrome already installed, use `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`. Browser tests require a separate local PostgreSQL database named `medifair_e2e` through `E2E_DATABASE_URL` and block external browser requests. `pnpm dev` binds to 127.0.0.1; do not expose it publicly.

