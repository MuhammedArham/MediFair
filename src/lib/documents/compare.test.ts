import { describe, expect, it } from "vitest";
import { mockDocumentFixtures } from "./mock-fixtures";
import { compareBills, type BillDocument } from "./compare";
import type { DocumentAnalysisResult } from "./schema";

const document = (id: string): BillDocument => { const fixture = mockDocumentFixtures.find((item) => item.id === id)!; return { id, label: fixture.fileName, result: fixture.result }; };
const empty = { previous: null, revised: null, invoice: null, statement: null };

describe("deterministic bill review", () => {
  it("finds the $700 added invoice charge and earlier surgeon fee decrease", () => {
    const result = compareBills({ previous: document("original"), revised: document("revised"), invoice: document("invoice"), statement: document("benefit") });
    expect(result.revisedToInvoice).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "ADDED_CHARGE" && issue.deltaCents === 70000)).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "PREVIOUSLY_UNDISCLOSED" && issue.evidence[0].page === 1)).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "DECREASE" && issue.deltaCents === -20000)).toBe(true);
    expect(result.issues.some((issue) => issue.kind === "MISSING_PAYMENT" && issue.deltaCents === 300000)).toBe(true);
  });
  it("flags an incorrect total without calling a charge unlawful", () => {
    const result = compareBills({ ...empty, invoice: document("inconsistent") });
    expect(result.issues.find((issue) => issue.kind === "ARITHMETIC")?.deltaCents).toBe(15000);
    expect(result.issues.find((issue) => issue.kind === "ARITHMETIC")?.evidence[0]).toMatchObject({ page: 1, excerpt: "Total provider fees: $3,000.00" });
  });
  it("keeps missing amounts unknown", () => {
    const original = document("original");
    const revised: BillDocument = { ...document("revised"), result: { ...document("revised").result, lineItems: document("revised").result.lineItems.map((line) => line.category === "SURGEON" ? { ...line, amountCents: null } : line) } };
    const issues = compareBills({ ...empty, previous: original, revised }).issues;
    expect(issues.some((issue) => issue.kind === "UNKNOWN_AMOUNT" && issue.deltaCents === null)).toBe(true);
  });
  it("flags potential duplicate entries and does not assume identical line names establish distinct services", () => {
    const invoice = document("invoice");
    const first = invoice.result.lineItems[0];
    const duplicated: DocumentAnalysisResult = { ...invoice.result, lineItems: [...invoice.result.lineItems, { ...first }] };
    expect(compareBills({ ...empty, invoice: { ...invoice, result: duplicated } }).issues.some((issue) => issue.kind === "POTENTIAL_DUPLICATE")).toBe(true);
  });
  it("blocks financial differences when procedure scope or provider does not match", () => {
    const previous = document("original");
    const revised = document("revised");
    revised.result = { ...revised.result, mbsItemNumbers: ["99999"] };
    const result = compareBills({ ...empty, previous, revised });
    expect(result.comparable).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toContain("SCOPE_REVIEW");
    expect(result.issues.some((issue) => issue.kind === "DECREASE")).toBe(false);
  });
});
