# MediFair AI development instructions

These instructions apply to all future work in this repository.

## Product and scope

- Build a consent-led assistant for Australian patients comparing private specialist costs and preparing cost questions. Keep this repository's demo data synthetic.
- Distinguish product preview UI from working integrations. Never display fabricated clinics, patient quotes, insurer benefits, or calculated savings as facts.
- Keep the app accessible and responsive. Use semantic headings, labelled controls, keyboard-visible focus, and readable contrast.

## Safety gates

- `DEMO_MODE=true` is the default. Do not process real patient records or send them to any external AI service.
- No outbound email without a recorded, explicit approval for the exact message and recipient, followed by a separate send action. Real email sending in demo mode must enforce `DEMO_ALLOWED_RECIPIENTS` on the server. Never externally send to `.example` fixture addresses; mock transport may store those fictional recipients locally.
- Keep API keys and webhook secrets on the server and out of Git. Verify inbound email signatures before accepting messages when that integration is built.
- Do not offer clinical advice, insurer coverage guarantees, or guaranteed savings. Escalate uncertain or incomplete figures to a clear “not confirmed” state.

## Australian source discipline

- Prefer official Australian sources. Maintain `docs/australian-sources.md` with exact URL, publisher, retrieval date, effective date or “not stated,” and the claims each source supports.
- Recheck time-sensitive rules, schedule fees, and policy details at the point of use. Do not assume public APIs or scrape sites.
- The MBS schedule fee is distinct from a provider's actual fee, any benefit, and the patient's out-of-pocket gap. Medical Costs Finder statistics are benchmarks, not personalised quotes.
- When coverage or other charges are unknown, show the missing input instead of estimating savings.

## Engineering practice

- Use Next.js App Router, TypeScript, Tailwind CSS, Prisma with PostgreSQL in development and production, Zod at input boundaries, and Vitest/Playwright for meaningful tests as features land. Preserve the archived SQLite migrations only for historical/test compatibility.
- Keep external service code behind server-only modules. Validate inputs and structured AI output. Preserve source text, provenance, and reviewer corrections for extracted figures.
- Run `pnpm lint` and `pnpm typecheck` before handoff. Add focused tests for state transitions, approval gates, and cost calculations when those are implemented.
- Update `docs/architecture.md` when implementing a flow, model, or integration. Never commit `.env`, database files, or generated client code.

## Persistent development rules

- `EMAIL_TRANSPORT=mock` is the default.
- `AI_PROVIDER=mock` is the default.
- `DEMO_MODE=true` is the default.
- All product features must work without external credentials.
- Implement real integrations behind interchangeable interfaces.
- Mock and real providers must share the same application processing logic.
- Mock events must be labelled as simulated.
- Never silently fall back to mock when real mode fails.
- Never claim that a simulated email was actually delivered.
- Never transmit actual patient data in demo mode.
- Outbound messages always require explicit user approval.
- Do not repeatedly request unavailable credentials.
- Preserve the existing architecture and database.
- Keep changes focused, test them and give concise reports.
- Bind the unauthenticated demo to loopback only. A public synthetic demo requires the single-operator server-side access gate; this is not patient account authentication. Do not process real patient records until patient authentication and privacy controls exist.
- Browser QA must use the isolated `.e2e` database and mock services. Reset must preserve other cases and shared catalogue records.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
