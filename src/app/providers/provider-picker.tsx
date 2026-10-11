"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ExternalLink, Pencil, Plus } from "lucide-react";
import { saveManualPracticeAction, saveSelectionAction } from "./actions";
import { emptyManualPractice, manualPracticeSchema, type ManualPracticeForm } from "@/lib/provider-selection";

export type CandidatePractice = {
  id: string;
  practiceName: string;
  medicalSpecialty: string | null;
  sourceType: "DEMO" | "VERIFIED_EXTERNAL";
  websiteUrl: string | null;
  email: string | null;
  suburb: string;
  state: string;
  postcode: string;
  contactSource: string;
  contactSourceUrl: string | null;
  hospitalNames: string[];
  reportedHospitalName: string | null;
  verifiedByUserAt: string | null;
};

const inputStyle = "mt-1.5 w-full rounded-lg border border-[#cdded2] bg-white px-3 py-2.5 text-sm text-[#173d39] focus:border-[#337758] focus:outline-none focus:ring-2 focus:ring-[#bcead0]";

export function ProviderPicker({ caseId, caseSpecialty, candidates, initialSelectedIds }: { caseId: string; caseSpecialty: string | null; candidates: CandidatePractice[]; initialSelectedIds: string[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [savedIds, setSavedIds] = useState(initialSelectedIds);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [manualMessage, setManualMessage] = useState("");
  const [manualErrors, setManualErrors] = useState<Record<string, string[]>>({});
  const [manual, setManual] = useState<ManualPracticeForm>(emptyManualPractice);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectionPending, startSelection] = useTransition();
  const [manualPending, startManual] = useTransition();
  const dirty = [...selectedIds].sort().join("|") !== [...savedIds].sort().join("|");

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : current.length < 3 ? [...current, id] : current);
    setSelectionMessage("");
  }

  function saveSelection() {
    startSelection(async () => {
      const result = await saveSelectionAction(caseId, selectedIds);
      setSelectionMessage(result.message);
      if (result.ok) { setSavedIds(result.selectedIds); router.refresh(); }
    });
  }

  function setManualValue<K extends keyof ManualPracticeForm>(key: K, value: ManualPracticeForm[K]) {
    setManual((current) => ({ ...current, [key]: value }));
    setManualErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  }

  function beginEdit(practice: CandidatePractice) {
    setEditId(practice.id);
    setManual({
      practiceName: practice.practiceName, email: practice.email ?? "", websiteUrl: practice.websiteUrl ?? "",
      suburb: practice.suburb, state: practice.state as ManualPracticeForm["state"], postcode: practice.postcode,
      contactSource: practice.contactSource, contactSourceUrl: practice.contactSourceUrl ?? "",
      reportedHospitalName: practice.reportedHospitalName ?? "", verifiedContact: false,
    });
    setManualErrors({});
    setManualMessage("Review the details and confirm contact verification again before saving.");
    document.getElementById("manual-practice-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = manualPracticeSchema.safeParse(manual);
    if (!parsed.success) { setManualErrors(parsed.error.flatten().fieldErrors); setManualMessage("Check the highlighted contact details."); return; }
    startManual(async () => {
      const result = await saveManualPracticeAction(caseId, editId, parsed.data);
      setManualMessage(result.message);
      if (result.ok) {
        setManual(emptyManualPractice);
        setEditId(null);
        setManualErrors({});
        router.refresh();
      } else setManualErrors(result.errors);
    });
  }

  const field = (key: keyof ManualPracticeForm, label: string, required = false, placeholder?: string) => {
    const error = manualErrors[key]?.[0];
    return <div key={key}><label htmlFor={key} className="block text-xs font-semibold text-[#325848]">{label}{required ? " *" : ""}</label><input id={key} name={key} value={String(manual[key])} onChange={(event) => setManualValue(key, event.target.value as never)} className={inputStyle} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? `${key}-error` : undefined} required={required} maxLength={key === "contactSource" ? 200 : 120} />{error && <p id={`${key}-error`} className="mt-1 text-xs text-[#a23a31]">{error}</p>}</div>;
  };

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
    <div className="space-y-5"><section className="rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#468066]">Shortlist</p><h2 className="mt-1 font-serif text-2xl text-[#173d39]">Choose up to three practices</h2><p className="mt-2 text-sm leading-6 text-[#667b6d]">Selection saves names for this case. It does not send a quote request.</p></div><span className="badge">{selectedIds.length} / 3 selected</span></div>
      {candidates.length ? <div className="mt-5 grid gap-3">{candidates.map((practice) => {
        const selected = selectedIds.includes(practice.id);
        const specialtyChanged = practice.sourceType === "VERIFIED_EXTERNAL" && practice.medicalSpecialty !== caseSpecialty;
        const disabled = specialtyChanged || (!selected && selectedIds.length >= 3);
        return <article key={practice.id} className={`rounded-xl border p-4 ${selected ? "border-[#78ba91] bg-[#f2faf3]" : "border-[#e1eae2] bg-white"}`}>
          <div className="flex items-start gap-3"><input id={`practice-${practice.id}`} type="checkbox" checked={selected} disabled={disabled || selectionPending} onChange={() => toggle(practice.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#276b54] disabled:opacity-40" aria-describedby={`practice-info-${practice.id}`} /><div id={`practice-info-${practice.id}`} className="min-w-0 flex-1"><label htmlFor={`practice-${practice.id}`} className="cursor-pointer text-sm font-bold text-[#214b39]">{practice.practiceName}</label><div className="mt-1 flex flex-wrap gap-2"><span className="badge">{practice.sourceType === "DEMO" ? "FICTIONAL DEMO" : "USER-VERIFIED EXTERNAL"}</span><span className="text-xs text-[#6e8474]">{practice.suburb}, {practice.state} {practice.postcode}</span></div>
            <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2"><div><dt className="font-semibold text-[#425f4d]">Specialty</dt><dd className="text-[#617869]">{practice.medicalSpecialty ?? "Not recorded"}{specialtyChanged && <span className="ml-1 font-semibold text-[#995d21]">— review after case change</span>}</dd></div><div><dt className="font-semibold text-[#425f4d]">Website</dt><dd className="break-all text-[#617869]">{practice.websiteUrl ? practice.sourceType === "DEMO" ? `${practice.websiteUrl} (fictional)` : <a href={practice.websiteUrl} target="_blank" rel="noreferrer" className="text-[#226d50] underline">{practice.websiteUrl}<ExternalLink size={12} className="ml-1 inline" aria-hidden="true" /></a> : "Not supplied"}</dd></div><div><dt className="font-semibold text-[#425f4d]">Email</dt><dd className="break-all text-[#617869]">{practice.email ?? "Not supplied"}{practice.sourceType === "DEMO" ? " (fictional)" : ""}</dd></div><div><dt className="font-semibold text-[#425f4d]">Associated hospital</dt><dd className="text-[#617869]">{practice.hospitalNames.length ? practice.hospitalNames.join(", ") : practice.reportedHospitalName ? `${practice.reportedHospitalName} (user reported)` : "Not known"}</dd></div><div className="sm:col-span-2"><dt className="font-semibold text-[#425f4d]">Contact source</dt><dd className="text-[#617869]">{practice.contactSource}{practice.contactSourceUrl && <a href={practice.contactSourceUrl} target="_blank" rel="noreferrer" className="ml-1 break-all text-[#226d50] underline">Source link<ExternalLink size={12} className="ml-1 inline" aria-hidden="true" /></a>}</dd></div></dl>
            {practice.sourceType === "VERIFIED_EXTERNAL" && <button type="button" onClick={() => beginEdit(practice)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#246d50] underline"><Pencil size={13} aria-hidden="true" />Edit contact details</button>}
          </div></div>
        </article>;
      })}</div> : <div className="mt-5 rounded-xl border border-dashed border-[#cdded2] p-5 text-sm text-[#667b6d]"><Building2 size={24} aria-hidden="true" /><p className="mt-2">No demo practices are listed for this specialty. Add a practice only after you verify its contact details.</p></div>}
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={saveSelection} disabled={!dirty || selectionPending} className="button button-primary disabled:cursor-not-allowed disabled:opacity-45"><Check size={16} aria-hidden="true" />{selectionPending ? "Saving…" : "Save shortlist"}</button>{!dirty && savedIds.length > 0 && <Link href={`/requests?case=${caseId}`} className="text-sm font-semibold text-[#246d50] underline">Review quote-request drafts</Link>}<span className="text-xs text-[#657b6b]" role="status" aria-live="polite">{selectionMessage || (dirty ? "Unsaved selection changes" : "Selection saved")}</span></div>
    </section>
    <section id="manual-practice-form" className="rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-7"><p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#468066]">Manual entry</p><h2 className="mt-1 font-serif text-2xl">{editId ? "Edit user-supplied practice" : "Add a verified practice"}</h2><p className="mt-2 text-xs leading-5 text-[#667b6d]">Supply details you checked yourself. MediFair AI does not independently verify the practice or its clinical suitability. No message will be sent.</p>
      <form onSubmit={submitManual} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">{field("practiceName", "Practice name", true)}{field("email", "Verified practice email", true, "name@practice.au")}{field("websiteUrl", "Website (optional)", false, "https://...")}{field("suburb", "Suburb or town", true)}<div><label htmlFor="state" className="block text-xs font-semibold text-[#325848]">State *</label><select id="state" value={manual.state} onChange={(event) => setManualValue("state", event.target.value as ManualPracticeForm["state"])} className={inputStyle}>{["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"].map((state) => <option key={state}>{state}</option>)}</select></div>{field("postcode", "Postcode", true)}<div className="sm:col-span-2">{field("contactSource", "How you verified the contact details", true, "e.g. Checked the practice website on 11 October 2026")}</div><div className="sm:col-span-2">{field("contactSourceUrl", "Contact source URL (optional)", false, "https://...")}</div><div className="sm:col-span-2">{field("reportedHospitalName", "Associated hospital, if known (optional)")}</div>
        <label className="flex items-start gap-3 rounded-lg bg-[#f3f8f3] p-3 text-xs leading-5 text-[#365a45] sm:col-span-2"><input id="verifiedContact" type="checkbox" checked={manual.verifiedContact} onChange={(event) => setManualValue("verifiedContact", event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#276b54]" aria-invalid={Boolean(manualErrors.verifiedContact?.length)} /><span>I checked this practice name and email against the source described above. I understand this does not confirm the specialist performs the procedure.{manualErrors.verifiedContact && <small className="mt-1 block text-[#a23a31]">{manualErrors.verifiedContact[0]}</small>}</span></label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={manualPending} className="button button-primary disabled:opacity-45"><Plus size={16} aria-hidden="true" />{manualPending ? "Saving…" : editId ? "Save practice changes" : "Add practice"}</button>{editId && <button type="button" onClick={() => { setEditId(null); setManual(emptyManualPractice); setManualErrors({}); setManualMessage(""); }} className="text-xs font-semibold text-[#48705b] underline">Cancel edit</button>}</div><p role="status" aria-live="polite" className="text-xs text-[#566e5e] sm:col-span-2">{manualMessage}</p>
      </form>
    </section></div>
    <aside className="grid gap-4"><section className="rounded-2xl border border-[#d7e8d9] bg-[#eaf4ec] p-5"><h2 className="font-serif text-xl text-[#1d513d]">Before you choose</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-[#536f5c]"><li>A listing does not establish that a specialist performs this exact treatment.</li><li>A consultation or referral may be required before a practice can quote.</li><li>Ask a healthcare professional to confirm provider suitability.</li><li>A hospital quote may exclude independently billing doctors, such as a surgeon or anaesthetist.</li></ul></section><section className="rounded-2xl border border-[#e1e9e2] bg-white p-5"><h2 className="text-sm font-semibold">Discover and check manually</h2><p className="mt-2 text-xs leading-5 text-[#667b6d]">Open these sites yourself. MediFair AI does not scrape them or use an assumed directory API.</p><ul className="mt-4 grid gap-3 text-xs font-semibold text-[#246a50]"><li><a href="https://www.healthdirect.gov.au/" target="_blank" rel="noreferrer" className="underline">Healthdirect service finder <ExternalLink size={12} className="inline" aria-hidden="true" /></a></li><li><a href="https://www.ahpra.gov.au/" target="_blank" rel="noreferrer" className="underline">Ahpra practitioner register <ExternalLink size={12} className="inline" aria-hidden="true" /></a></li><li><a href="https://medicalcostsfinder.health.gov.au/" target="_blank" rel="noreferrer" className="underline">Medical Costs Finder <ExternalLink size={12} className="inline" aria-hidden="true" /></a></li></ul><p className="mt-4 text-[11px] leading-5 text-[#738477]">Ahpra registration checks a practitioner, not the practice email. Medical Costs Finder information is a guide, not a personal quote.</p></section></aside>
  </div>;
}
