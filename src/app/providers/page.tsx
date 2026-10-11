import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-elements";
import { getCase, listProviders } from "@/lib/db/repository";
import { listCandidatePractices } from "@/lib/db/provider-selection";
import { ProviderPicker } from "./provider-picker";

const money = (cents: number | null | undefined) => cents == null ? "Unknown" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<{ case?: string | string[]; created?: string | string[] }> }) {
  const query = await searchParams;
  const caseId = typeof query.case === "string" ? query.case : null;
  if (query.case && !caseId) notFound();
  await connection();
  const caseRecord = caseId ? await getCase(caseId) : null;
  if (caseId && !caseRecord) notFound();
  const selection = caseRecord ? await listCandidatePractices(caseRecord.id) : null;
  const providers = caseRecord ? [] : await listProviders();
  const candidates = selection?.providers.map((provider) => ({
    id: provider.id, practiceName: provider.practiceName, medicalSpecialty: provider.medicalSpecialty,
    sourceType: provider.sourceType, websiteUrl: provider.websiteUrl, email: provider.email,
    suburb: provider.suburb, state: provider.state, postcode: provider.postcode,
    contactSource: provider.contactSource, contactSourceUrl: provider.contactSourceUrl,
    hospitalNames: provider.hospitals.map((association) => association.hospital.name),
    reportedHospitalName: provider.reportedHospitalName,
    verifiedByUserAt: provider.verifiedByUserAt?.toISOString() ?? null,
  })) ?? [];
  return <>
    <PageHeading eyebrow="PRACTICE OUTREACH" title={caseRecord ? "Provider selection" : "Providers"} description={caseRecord ? `Choose up to three practices for the fictional ${caseRecord.medicalSpecialty ?? "specialist"} case. Check clinical suitability separately.` : "Select a case to save a practice shortlist. The seeded examples are fictional eye practices."} action={{ href: "/case/new", label: "Start a case" }} />
    {caseRecord && <section className="mb-6 rounded-2xl border border-[#cde6d2] bg-[#e9f6ed] p-5 sm:p-7" aria-label="Saved case confirmation">
      <p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#367a59]">{query.created === "1" ? "Fictional case saved" : "Fictional case summary"}</p>
      <h2 className="mt-2 font-serif text-2xl text-[#173d39]">{caseRecord.procedureName}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-[#667e6d]">Specialty</dt><dd className="font-semibold">{caseRecord.medicalSpecialty ?? "Not supplied"}</dd></div><div><dt className="text-[#667e6d]">General location</dt><dd className="font-semibold">{caseRecord.suburb}, {caseRecord.state} {caseRecord.postcode}</dd></div><div><dt className="text-[#667e6d]">Referral or plan</dt><dd className="font-semibold capitalize">{caseRecord.referralStatus.replaceAll("_", " ").toLowerCase()}</dd></div><div><dt className="text-[#667e6d]">MBS item</dt><dd className="font-semibold">{caseRecord.mbsItemNumber ?? "Not supplied"} · {caseRecord.mbsItemStatus.replaceAll("_", " ").toLowerCase()}</dd></div><div><dt className="text-[#667e6d]">Medicare eligibility</dt><dd className="font-semibold capitalize">{caseRecord.medicareEligibility.toLowerCase()}</dd></div><div><dt className="text-[#667e6d]">Private cover</dt><dd className="font-semibold">{caseRecord.insuranceProfile?.insurerName ?? "Not supplied"} · {caseRecord.insuranceProfile?.coverageVerificationStatus === "PATIENT_REPORTED_CONFIRMED" ? "patient reports confirmed" : "not confirmed"}</dd></div><div><dt className="text-[#667e6d]">Hospital cover tier</dt><dd className="font-semibold">{caseRecord.insuranceProfile?.hospitalCoverTier ?? "Unknown"}</dd></div><div><dt className="text-[#667e6d]">Known excess / co-payment</dt><dd className="font-semibold">{money(caseRecord.insuranceProfile?.knownExcessCents)} / {money(caseRecord.insuranceProfile?.knownCopaymentCents)}</dd></div><div><dt className="text-[#667e6d]">Preferred area / travel</dt><dd className="font-semibold">{caseRecord.preference?.preferredLocation ?? "Not supplied"} · {caseRecord.preference?.travelDistanceKm == null ? "distance not set" : `${caseRecord.preference.travelDistanceKm} km`}</dd></div><div><dt className="text-[#667e6d]">Budget preference</dt><dd className="font-semibold">{money(caseRecord.preference?.budgetCents)}</dd></div><div><dt className="text-[#667e6d]">Preferred practice / hospital</dt><dd className="font-semibold">{caseRecord.preference?.preferredProviderName ?? "None"} / {caseRecord.preference?.preferredHospitalName ?? "None"}</dd></div><div><dt className="text-[#667e6d]">Accessibility / language</dt><dd className="font-semibold">{caseRecord.preference?.accessibilityNotes ?? "None"} / {caseRecord.preference?.languagePreference ?? "None"}</dd></div></dl>
      {caseRecord.insuranceProfile?.policyDetails && <p className="mt-4 text-xs text-[#557361]"><strong>Other policy details:</strong> {caseRecord.insuranceProfile.policyDetails}</p>}
      <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-[#26654d]"><Link href={`/case/${caseRecord.id}`} className="underline">View case</Link>{caseRecord.status === "DRAFT" && <Link href={`/case/new?edit=${caseRecord.id}`} className="underline">Edit details</Link>}</div>
      <p className="mt-4 text-xs leading-5 text-[#597863]">Selecting practices does not contact them. Contact details supplied by a user are labelled separately from fictional demo entries.</p>
    </section>}
    {caseRecord && selection ? <ProviderPicker caseId={caseRecord.id} caseSpecialty={caseRecord.medicalSpecialty} candidates={candidates} initialSelectedIds={selection.selectedIds} /> : <section className="rounded-2xl border border-[#dce8df] bg-white p-6"><h2 className="font-serif text-2xl">Choose a case to begin</h2><p className="mt-2 text-sm text-[#647875]">The current demo includes {providers.length} fictional Sydney eye practices. Open the sample case to select or edit its shortlist.</p><Link href="/providers?case=demo-case" className="button button-primary mt-5">Open fictional cataract case</Link></section>}
  </>;
}
