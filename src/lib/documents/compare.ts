import type { DocumentAnalysisResult } from "./schema";

export type BillIssueKind = "INCREASE" | "DECREASE" | "ADDED_CHARGE" | "REMOVED_CHARGE" | "POTENTIAL_DUPLICATE" | "MISSING_PAYMENT" | "ARITHMETIC" | "INCLUSION_CHANGED" | "EXCLUSION_CHANGED" | "PREVIOUSLY_UNDISCLOSED" | "SCOPE_REVIEW" | "UNKNOWN_AMOUNT";
export type BillIssue = { kind: BillIssueKind; description: string; deltaCents: number | null; evidence: { role: string; page: number; excerpt: string }[]; confidence: "LOW" | "MEDIUM" | "HIGH" };
export type BillDocument = { id: string; label: string; result: DocumentAnalysisResult };
export type BillSelection = { previous: BillDocument | null; revised: BillDocument | null; invoice: BillDocument | null; statement: BillDocument | null };

function key(line: DocumentAnalysisResult["lineItems"][number]) {
  return `${line.category}|${line.description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}
function source(role: string, line: DocumentAnalysisResult["lineItems"][number]) { return { role, page: line.page, excerpt: line.evidence }; }
function charges(result: DocumentAnalysisResult) { return result.lineItems.filter((line) => line.kind === "CHARGE" || line.kind === "TAX"); }
function amountSum(lines: DocumentAnalysisResult["lineItems"]) { return lines.every((line) => line.amountCents !== null) ? lines.reduce((sum, line) => sum + line.amountCents!, 0) : null; }
function sameScope(a: DocumentAnalysisResult, b: DocumentAnalysisResult, allowDifferentProvider = false) {
  if (!allowDifferentProvider && (!a.providerName || !b.providerName || a.providerName.toLowerCase() !== b.providerName.toLowerCase())) return false;
  if (!a.mbsItemNumbers.length || !b.mbsItemNumbers.length || !a.mbsItemNumbers.some((item) => b.mbsItemNumbers.includes(item))) return false;
  if (a.serviceDates.length && b.serviceDates.length && !a.serviceDates.some((date) => b.serviceDates.includes(date))) return false;
  return true;
}

export function compareBills(selection: BillSelection) {
  const issues: BillIssue[] = [];
  const selected = Object.entries(selection).filter((entry): entry is [keyof BillSelection, BillDocument] => entry[1] !== null);
  for (const [role, doc] of selected) {
    const lines = charges(doc.result);
    if (doc.result.totalMeaning === "GROSS_CHARGES") {
      const summed = amountSum(lines);
      if (summed === null) issues.push({ kind: "UNKNOWN_AMOUNT", description: `${doc.label}: one or more charges are unknown, so the stated total cannot be checked.`, deltaCents: null, evidence: [], confidence: "HIGH" });
      else if (doc.result.totalCents === null) issues.push({ kind: "UNKNOWN_AMOUNT", description: `${doc.label}: total charges were not stated.`, deltaCents: null, evidence: [], confidence: "HIGH" });
      else if (summed !== doc.result.totalCents) issues.push({ kind: "ARITHMETIC", description: `${doc.label}: itemised charges total ${summed} cents, differing from the stated total of ${doc.result.totalCents} cents. Ask for clarification.`, deltaCents: doc.result.totalCents - summed, evidence: doc.result.evidence.filter((item) => item.fieldPath === "totalCents").map((item) => ({ role, page: item.page, excerpt: item.excerpt })), confidence: "HIGH" });
    }
    const seen = new Map<string, DocumentAnalysisResult["lineItems"][number]>();
    for (const line of lines) {
      const identity = `${key(line)}|${line.amountCents}`;
      if (seen.has(identity)) issues.push({ kind: "POTENTIAL_DUPLICATE", description: `${doc.label}: ${line.description} appears more than once with the same amount. Check whether the services differ.`, deltaCents: line.amountCents, evidence: [source(role, seen.get(identity)!), source(role, line)], confidence: "MEDIUM" });
      else seen.set(identity, line);
    }
  }
  const comparePair = (before: BillDocument | null, after: BillDocument | null, beforeRole: string, afterRole: string) => {
    if (!before || !after) return false;
    if (!sameScope(before.result, after.result)) {
      issues.push({ kind: "SCOPE_REVIEW", description: `${before.label} and ${after.label} have no confirmed matching provider, MBS item and service scope. Fee differences are not calculated.`, deltaCents: null, evidence: [], confidence: "HIGH" });
      return false;
    }
    const oldLines = charges(before.result), newLines = charges(after.result);
    const oldMap = new Map(oldLines.map((line) => [key(line), line]));
    const newMap = new Map(newLines.map((line) => [key(line), line]));
    for (const [identity, next] of newMap) {
      const prior = oldMap.get(identity);
      if (!prior) {
        issues.push({ kind: "ADDED_CHARGE", description: `${after.label}: added ${next.description}. Ask what the charge covers.`, deltaCents: next.amountCents, evidence: [source(afterRole, next)], confidence: "HIGH" });
        if (afterRole === "invoice") issues.push({ kind: "PREVIOUSLY_UNDISCLOSED", description: `${next.description} was absent from the selected earlier estimate. Confirm whether it was discussed before treatment.`, deltaCents: next.amountCents, evidence: [source(afterRole, next)], confidence: "MEDIUM" });
      } else if (prior.amountCents === null || next.amountCents === null) {
        issues.push({ kind: "UNKNOWN_AMOUNT", description: `${next.description}: cannot calculate a change because an amount is unknown.`, deltaCents: null, evidence: [source(beforeRole, prior), source(afterRole, next)], confidence: "HIGH" });
      } else if (prior.amountCents !== next.amountCents) {
        const delta = next.amountCents - prior.amountCents;
        issues.push({ kind: delta > 0 ? "INCREASE" : "DECREASE", description: `${next.description} ${delta > 0 ? "increased" : "decreased"} from ${prior.amountCents} to ${next.amountCents} cents.`, deltaCents: delta, evidence: [source(beforeRole, prior), source(afterRole, next)], confidence: "HIGH" });
      }
    }
    for (const [identity, prior] of oldMap) if (!newMap.has(identity)) issues.push({ kind: "REMOVED_CHARGE", description: `${prior.description} is absent from ${after.label}. Confirm whether it is included elsewhere.`, deltaCents: prior.amountCents === null ? null : -prior.amountCents, evidence: [source(beforeRole, prior)], confidence: "MEDIUM" });
    for (const [kind, name] of [["INCLUSION_CHANGED", "includedComponents"], ["EXCLUSION_CHANGED", "excludedComponents"]] as const) {
      const oldValues = before.result[name].map((value) => value.toLowerCase());
      const newValues = after.result[name].map((value) => value.toLowerCase());
      if (oldValues.join("|") !== newValues.join("|")) issues.push({ kind, description: `${name === "includedComponents" ? "Included" : "Excluded"} components changed between ${before.label} and ${after.label}; review the source documents.`, deltaCents: null, evidence: [], confidence: "MEDIUM" });
    }
    return true;
  };
  const previousToRevised = comparePair(selection.previous, selection.revised, "previous", "revised");
  const revisedToInvoice = comparePair(selection.revised ?? selection.previous, selection.invoice, selection.revised ? "revised" : "previous", "invoice");
  if (selection.statement && selection.invoice) {
    if (!sameScope(selection.statement.result, selection.invoice.result, true)) issues.push({ kind: "SCOPE_REVIEW", description: "The benefit statement and invoice do not share a documented MBS item and service date; payment cannot be matched automatically.", deltaCents: null, evidence: [], confidence: "HIGH" });
    else {
      for (const payment of selection.statement.result.lineItems.filter((line) => line.kind === "BENEFIT" || line.kind === "PAYMENT")) {
        const invoiced = selection.invoice.result.lineItems.some((line) => line.category === payment.category && line.amountCents === payment.amountCents);
        if (!invoiced) issues.push({ kind: "MISSING_PAYMENT", description: `${payment.description} appears on the statement but not on the invoice. Ask whether it has been applied; this is not proof of an error.`, deltaCents: payment.amountCents, evidence: [source("statement", payment)], confidence: "MEDIUM" });
      }
    }
  }
  return { issues, previousToRevised, revisedToInvoice, comparable: previousToRevised || revisedToInvoice };
}
