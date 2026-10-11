# Known limitations and security boundary

- This is a **single-operator synthetic demo**, not a production patient portal. A production Basic-auth gate restricts workspace access but there are no patient accounts, multi-user ownership checks, a completed encryption/retention strategy or real patient consent/governance workflow. Do not use real patient data.
- Real OpenAI/Resend adapters are implemented and exercised with SDK mocks only. Credentials, domain verification, email delivery, inbound routing and live extraction have not been tested. No external API calls were made during this QA task.
- Mock AI recognises exact supported email/PDF fixtures. Edited or unfamiliar text is unsupported/manual review. Text PDFs only; no OCR, image understanding, medical diagnosis or clinical suitability assessment.
- Fictional quote fixtures use an October 2026 scenario. Expiry matters: expired estimates cannot be ranked. Do not present historical fixtures as current personal quotes.
- Synthetic scope and DemoCover acknowledgements are explicit local test evidence, never actual clinician or insurer verification. Incomplete fees, unknown benefits and changed service scope prevent a complete cost comparison. A revised quote is not a realised saving.
- Supporting documents are shown as references in drafts but are not attached to outbound email. Received attachment metadata is retained; attachments are not automatically downloaded/executed.
- Closing a bill negotiation dismisses its review finding; it does not prove a billing error, correction or refund. The timeline retains the response and uncertainty.
- Reset clears the canonical sample case only. Other locally created synthetic cases are preserved. Private file deletion occurs after the database transaction; a storage failure can leave an orphaned private object requiring cleanup.
- Current source claims retain their previous recorded review and limitations. This QA pass made no new official-source requests. Reverify time-sensitive Australian guidance, MBS effective dates and insurer rules before live use. Benchmarks are not quotes; future-effective MBS schedules are not applied.
- Mock browser QA uses desktop Chrome and a 390px mobile viewport. It is not a physical-device, cross-browser, screen-reader or independent penetration audit.

## Security review performed

Checked credential handling, safe configuration display, explicit content approvals, duplicate claims, raw signed webhook validation, mock-only simulator gate, fictional-case constraints, cross-case selection/document checks, PDF limits/private storage/path validation, safe text rendering and prompt-injection fixtures. Workspace access is centrally restricted; selected-case navigation is convenience, not an identity/authorisation mechanism. Uploaded files are downloaded as attachments with private/no-store headers and a restrictive CSP. API keys are never included in UI status.

- PostgreSQL and private Blob require provisioned services; migration execution, database persistence and Blob operations against a deployed service remain unverified without those resources. Historical SQLite integration tests continue to exercise business logic, while PostgreSQL browser tests require an isolated local `medifair_e2e` database.
- Vercel server uploads are capped at 4 MB in this app due to the platform request body limit. Private Blob and provider-specific data residency, backups and retention must be reviewed before any non-demo use.
