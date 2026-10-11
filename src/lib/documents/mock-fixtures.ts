import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { documentAnalysisSchema, type DocumentAnalysisResult, type PageText } from "./schema";

const charge = (category: DocumentAnalysisResult["lineItems"][number]["category"], description: string, cents: number, evidence: string) => ({ category, description, kind: "CHARGE" as const, amountCents: cents, page: 1, evidence });
const benefit = (category: "MEDICARE_PAYMENT" | "INSURER_PAYMENT", description: string, cents: number, evidence: string) => ({ category, description, kind: "BENEFIT" as const, amountCents: cents, page: 1, evidence });
const standard = (surgeonCents: number) => [
  charge("SURGEON", "Surgeon fee", surgeonCents, `Surgeon fee: $${(surgeonCents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`),
  charge("ANAESTHETIST", "Anaesthetist fee", 75000, "Anaesthetist fee: $750.00"),
  charge("HOSPITAL", "Hospital fee", 90000, "Hospital fee: $900.00"),
  charge("THEATRE", "Theatre fee", 45000, "Theatre fee: $450.00"),
  charge("ACCOMMODATION", "Accommodation", 25000, "Accommodation: $250.00"),
  charge("DEVICE", "Device", 50000, "Device: $500.00"),
  charge("MEDICINE", "Medicines", 8000, "Medicines: $80.00"),
];
const shared = {
  providerName: "Demo Harbour Eye Practice (fictional)", facilityName: null,
  serviceDates: ["2026-10-20"], mbsItemNumbers: ["42702"],
  patientBalanceCents: null, totalMeaning: "GROSS_CHARGES" as const,
  includedComponents: ["Surgeon", "Anaesthetist", "Hospital", "Theatre", "Accommodation", "Device", "Medicines"],
  excludedComponents: ["Diagnostic tests, if required"],
  conditions: ["Estimate only; valid until 31/10/2026"],
  confidence: "HIGH" as const, humanReviewFlags: [],
};
const evidence = (fieldPath: string, excerpt: string) => ({ fieldPath, page: 1, excerpt });

export const mockDocumentFixtures = [
  {
    id: "original", fileName: "synthetic-original-estimate.pdf", result: documentAnalysisSchema.parse({ ...shared,
      documentType: "SPECIALIST_ESTIMATE", documentDate: "2026-10-08", lineItems: standard(230000), totalCents: 523000,
      evidence: [evidence("providerName", "Practice: Demo Harbour Eye Practice (fictional)"), evidence("mbsItemNumbers", "Proposed MBS item: 42702"), evidence("totalCents", "Total provider fees: $5,230.00")],
    }),
  },
  {
    id: "revised", fileName: "synthetic-revised-estimate.pdf", result: documentAnalysisSchema.parse({ ...shared,
      documentType: "SPECIALIST_ESTIMATE", documentDate: "2026-10-12", lineItems: standard(210000), totalCents: 503000,
      conditions: ["Revised estimate only; valid until 31/10/2026"],
      evidence: [evidence("providerName", "Practice: Demo Harbour Eye Practice (fictional)"), evidence("mbsItemNumbers", "Proposed MBS item: 42702"), evidence("totalCents", "Total provider fees: $5,030.00")],
    }),
  },
  {
    id: "invoice", fileName: "synthetic-final-invoice.pdf", result: documentAnalysisSchema.parse({ ...shared,
      documentType: "FINAL_INVOICE", documentDate: "2026-10-22", lineItems: [
        ...standard(210000), charge("THEATRE", "Additional theatre session", 70000, "Additional theatre session: $700.00"),
        benefit("MEDICARE_PAYMENT", "Medicare payment shown", 100000, "Medicare payment shown: $1,000.00"),
      ], totalCents: 573000, patientBalanceCents: 473000,
      includedComponents: ["Surgeon", "Anaesthetist", "Hospital", "Theatre", "Accommodation", "Device", "Medicines", "Additional theatre session"],
      excludedComponents: [], conditions: ["Additional theatre session was not in revised estimate; ask for explanation"],
      evidence: [evidence("totalCents", "Total charges: $5,730.00"), evidence("patientBalanceCents", "Patient balance shown: $4,730.00"), evidence("conditions", "Additional theatre session: $700.00")],
    }),
  },
  {
    id: "benefit", fileName: "synthetic-insurer-statement.pdf", result: documentAnalysisSchema.parse({
      documentType: "BENEFIT_STATEMENT", providerName: "DemoCover (fictional)", facilityName: null, documentDate: "2026-10-23",
      serviceDates: ["2026-10-20"], mbsItemNumbers: ["42702"], lineItems: [benefit("INSURER_PAYMENT", "Insurer payment", 300000, "Insurer payment: $3,000.00")],
      totalCents: 300000, totalMeaning: "PAYMENT_TOTAL", patientBalanceCents: null,
      includedComponents: [], excludedComponents: [], conditions: ["Confirm whether the provider applied this synthetic payment"],
      evidence: [evidence("providerName", "Insurer: DemoCover (fictional)"), evidence("totalCents", "Insurer payment: $3,000.00")],
      confidence: "HIGH", humanReviewFlags: [],
    }),
  },
  {
    id: "inconsistent", fileName: "synthetic-inconsistent-total.pdf", result: documentAnalysisSchema.parse({ ...shared,
      documentType: "SPECIALIST_ESTIMATE", documentDate: "2026-10-24", serviceDates: [], mbsItemNumbers: [],
      lineItems: standard(210000).slice(0, 2), totalCents: 300000,
      includedComponents: ["Surgeon", "Anaesthetist"], excludedComponents: [],
      conditions: ["Synthetic arithmetic mismatch for manual review"],
      evidence: [evidence("totalCents", "Total provider fees: $3,000.00")],
      confidence: "LOW", humanReviewFlags: ["Declared total differs from itemised charges"],
    }),
  },
] as const;

export async function matchMockDocument(bytes: Uint8Array, pages: PageText[]) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  for (const fixture of mockDocumentFixtures) {
    const path = join(process.cwd(), "output", "pdf", fixture.fileName);
    const fixtureBytes = await readFile(path);
    if (createHash("sha256").update(fixtureBytes).digest("hex") !== hash) continue;
    if (!pages.some((page) => page.text.includes("FICTIONAL DOCUMENT"))) return null;
    return { fixture, result: fixture.result };
  }
  return null;
}
