# MediFair AI mock demo guide

All patients, practices, prices, insurer confirmations and messages below are synthetic. Use the local development server at http://127.0.0.1:3000. No email or AI credentials, domain or real addresses are needed. A local PostgreSQL database is required. Public synthetic deployments require a single-operator access gate and private storage; this is not a patient workspace.

## Find and compare — start with a new case

1. Dashboard → **Start a new case** → **Autofill fictional cataract example**. Review procedure, insurance and preferences; use Back to edit. Confirm both fictional-data and consent statements. Save.
2. Select the three fictional practices and **Save shortlist**. Open **Review quote-request drafts**.
3. Review the recipient, subject and full body on each card. Check each exact-content approval box and approve each draft separately.
4. Check the separate simulated-send statement, then **Send approved requests**. All three results must say simulated, never delivered.
5. Open **Inbox → Open email simulator**. The selected case is retained. Inject Harbour’s complete $2,400 baseline, Northside’s complete $1,800 baseline, and City’s missing-anaesthetist response. Choose the matching practice for each baseline.
6. Open **Quote Analysis** from Inbox. Inspect each source email and structured extraction. Unknown values remain unknown. Edited/unrecognised mock text goes to manual review.
7. Open **My Quotes**. Open each complete quote and explicitly record the fictional scope and DemoCover evidence review, with a note. These acknowledgements establish only the test scenario; they do not verify real cover. Incomplete City is excluded from ranking.
8. On City’s quote page, review/edit the missing-information request and save the follow-up draft. It needs fresh approval and a separate send.

## Analyse and negotiate — same case

1. Open **Opportunities**, inspect Northside’s gap-cover question and source evidence, then open **Negotiations**.
2. Select Northside’s gap-cover opportunity and create an editable request. Review recipient, disclosed information, reason and original amount. Documents are references only; files are not emailed.
3. **Review for approval → Approve exact email**. Check the separate send action and send.
4. In the same case’s simulator, select the pending Northside negotiation and **Provider agrees to $900 quoted gap**. Simulate the reply without editing this deterministic fixture.
5. Return to Negotiations: the revised quote is linked; $1,800 → $900 is a **$900 potential quoted reduction**. Original and revised quote versions remain available. This is not a paid bill or realised saving.
6. Explore smaller/conditional offers, refusal, requests for information and changed inclusions using additional requests. Unknown or changed scope cannot establish a comparable reduction.

## Document review — same case

1. Open **Analyse Bills**. Upload `output/pdf/synthetic-original-estimate.pdf` as a specialist estimate, attached to Harbour. Upload `synthetic-final-invoice.pdf` as a final invoice. Attest synthetic data for each upload.
2. Select these as previous quote and invoice, leaving revised quote empty. Compare. The invoice’s gross charges increased by $700; the UI asks for clarification without declaring wrongdoing or promising recovery.
3. Save a review finding → **Start negotiation draft**. Review, approve and simulate sending it.
4. In the simulator select that pending negotiation and a more-information or refusal response. Review the recorded source, interpretation and remaining uncertainty. Closing the negotiation dismisses the finding; it does not establish the charge was corrected.
5. For more scenarios on the seeded sample case, **Load five synthetic examples** also includes a revised estimate, insurer statement and arithmetic inconsistency. Original PDF downloads are private; corrections retain initial extraction.

## Reset

Settings → confirm the explicit reset checkbox → **Reset Demo** restores only the seeded Alex sample case. Uploaded PDFs and negotiations for that sample case are removed. Other created cases, their selected practices, quotes and documents are preserved. Catalogue practices remain available to every fictional case.
