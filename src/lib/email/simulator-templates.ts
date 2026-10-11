import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";
export const responseTemplates: { id: string; label: string; body: string }[] = [
  { id: "complete", label: "A. Complete quote with all fees", body: "FICTIONAL SIMULATED PROVIDER REPLY — We can provide an estimate for the requested procedure. Surgeon $2,100; anaesthetist $680; hospital and theatre $1,220; accommodation $220; device $540; medicines $80. Total fees $4,840. MBS item 42702 is proposed, subject to clinician confirmation. Benefits and the final out-of-pocket amount are not confirmed. Quote valid 30 days.\n[[MOCK_QUOTE_FIXTURE:complete-clear]]" },
  { id: "missing-anaesthetist", label: "B. Quote missing anaesthetist fees", body: "FICTIONAL SIMULATED PROVIDER REPLY — Surgeon fee $1,950. Hospital and device fees are to be confirmed. We have not included an anaesthetist estimate. Please request an itemised update before relying on this estimate.\n[[MOCK_QUOTE_FIXTURE:partial]]" },
  { id: "consultation", label: "C. Provider requires a consultation before quoting", body: "FICTIONAL SIMULATED PROVIDER REPLY — We require an initial consultation and referral before we can provide a personalised written quote. No procedure fees are quoted in this message.\n[[MOCK_QUOTE_FIXTURE:refusal]]" },
  { id: "no-gap", label: "D. Provider states a conditional no-gap arrangement", body: "FICTIONAL SIMULATED PROVIDER REPLY — For this synthetic example, the practice states that a no-gap arrangement may apply subject to insurer and eligibility confirmation. This is not a coverage guarantee and does not confirm hospital charges.\n[[MOCK_QUOTE_FIXTURE:no-gap]]" },
  { id: "refuse-discount", label: "E. Provider refuses a discount", body: "FICTIONAL SIMULATED PROVIDER REPLY — We are unable to reduce the quoted specialist fee. The current fee estimate remains unchanged. Please contact the insurer and facility separately to confirm other costs." },
  { id: "reduced", label: "F. Provider offers a reduced quote", body: "FICTIONAL SIMULATED PROVIDER REPLY — We can offer a revised synthetic surgeon fee of $1,850 instead of $2,100. Anaesthetist, hospital, benefits and final patient responsibility are unchanged or unconfirmed. A revised written quote is required.\n[[MOCK_QUOTE_FIXTURE:revised]]" },
  { id: "more-information", label: "G. Provider requests additional information", body: "FICTIONAL SIMULATED PROVIDER REPLY — Please provide the referral and confirm the proposed facility before we can prepare an estimate. Please do not email detailed medical records; a consultation may be required.\n[[MOCK_QUOTE_FIXTURE:no-prices]]" },
  { id: "ambiguous", label: "H. Provider sends an ambiguous quote", body: "FICTIONAL SIMULATED PROVIDER REPLY — The estimate is around the usual amount, with some items potentially covered. Final fees depend on the circumstances. Please call us to discuss." },
];

const fixtureMap: Record<string, string> = { complete: "complete-clear", "missing-anaesthetist": "partial", consultation: "refusal", "no-gap": "no-gap", reduced: "revised", "more-information": "no-prices", ambiguous: "inconsistent" };
for (const template of responseTemplates) {
  const fixture = mockQuoteFixtures.find((item) => item.id === fixtureMap[template.id]);
  if (fixture) template.body = fixture.body;
}
for (const id of ["baseline-harbour", "baseline-north"]) {
  const fixture = mockQuoteFixtures.find((item) => item.id === id)!;
  responseTemplates.unshift({ id, label: fixture.label, body: fixture.body });
}
