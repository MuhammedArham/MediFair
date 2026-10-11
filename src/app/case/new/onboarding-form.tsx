"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { saveOnboardingAction, type OnboardingActionState } from "./actions";
import {
  emptyOnboardingValues, fictionalCataractExample, insuranceStepSchema, onboardingSchema,
  preferencesStepSchema, procedureStepSchema, type OnboardingField, type OnboardingValues,
} from "@/lib/onboarding";

const steps = ["Procedure", "Insurance", "Preferences", "Consent"] as const;
const stepFields: OnboardingField[][] = [
  ["procedureName", "medicalSpecialty", "mbsItemNumber", "mbsClinicianConfirmed", "suburb", "state", "postcode", "referralStatus"],
  ["medicareEligibility", "insurerName", "hospitalCoverTier", "policyDetails", "excessDollars", "copaymentDollars", "coverageVerification"],
  ["preferredLocation", "travelDistanceKm", "budgetDollars", "preferredProviderName", "preferredHospitalName", "accessibilityNotes", "languagePreference"],
  ["consent", "demoAcknowledged"],
];
const inputStyle = "mt-2 w-full rounded-xl border border-[#ceddd3] bg-white px-4 py-3 text-sm text-[#173d39] shadow-sm outline-none transition focus:border-[#27745d] focus:ring-2 focus:ring-[#bcead0]";

function TextField({ id, label, value, onChange, error, hint, placeholder, type = "text", inputMode, maxLength }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: string;
  hint?: string; placeholder?: string; type?: string; inputMode?: "numeric" | "decimal"; maxLength?: number;
}) {
  return <div><label htmlFor={id} className="block text-sm font-semibold text-[#244b3d]">{label}</label>
    {hint && <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-[#657d6e]">{hint}</p>}
    <input id={id} name={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} className={inputStyle} aria-invalid={Boolean(error)} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined} />
    {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-[#a23a31]">{error}</p>}
  </div>;
}

function SelectField({ id, label, value, onChange, options, error, hint }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; error?: string; hint?: string;
}) {
  return <div><label htmlFor={id} className="block text-sm font-semibold text-[#244b3d]">{label}</label>
    {hint && <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-[#657d6e]">{hint}</p>}
    <select id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputStyle} aria-invalid={Boolean(error)} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-[#a23a31]">{error}</p>}
  </div>;
}

export function OnboardingForm({ initialValues = emptyOnboardingValues, editId }: { initialValues?: OnboardingValues; editId?: string }) {
  const [values, setValues] = useState<OnboardingValues>(initialValues);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [exampleLoaded, setExampleLoaded] = useState(false);
  const [actionState, formAction, pending] = useActionState<OnboardingActionState, FormData>(saveOnboardingAction, { message: "", errors: {} });
  const errorFor = (key: OnboardingField) => (errors[key] ?? actionState.errors[key])?.[0];
  const setValue = <K extends OnboardingField>(key: K, value: OnboardingValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  function validateCurrentStep() {
    const keys = stepFields[step];
    const subset = Object.fromEntries(keys.map((key) => [key, values[key]]));
    const schema = [procedureStepSchema, insuranceStepSchema, preferencesStepSchema][step];
    const parsed = schema.safeParse(subset);
    const nextErrors: Record<string, string[]> = parsed.success ? {} : parsed.error.flatten().fieldErrors;
    if (step === 0 && values.mbsClinicianConfirmed && !values.mbsItemNumber) nextErrors.mbsItemNumber = ["Add the item number confirmed by your treating clinician."];
    if (step === 1 && values.coverageVerification === "CONFIRMED" && !values.insurerName) nextErrors.insurerName = ["Name the insurer that confirmed this cover."];
    if (step === 1 && !values.insurerName && (values.hospitalCoverTier || values.policyDetails || values.excessDollars || values.copaymentDollars)) nextErrors.insurerName = ["Add an insurer name or clear the private cover details."];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
      return false;
    }
    return true;
  }

  function nextStep() {
    if (!validateCurrentStep()) return;
    const next = Math.min(step + 1, 3);
    setStep(next);
    setFurthestStep((current) => Math.max(current, next));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (step !== 3) { event.preventDefault(); return; }
    const parsed = onboardingSchema.safeParse(values);
    if (!parsed.success) {
      event.preventDefault();
      const nextErrors = parsed.error.flatten().fieldErrors;
      setErrors(nextErrors);
      const firstStep = stepFields.findIndex((keys) => keys.some((key) => nextErrors[key]?.length));
      if (firstStep >= 0) setStep(firstStep);
      requestAnimationFrame(() => document.getElementById(Object.keys(nextErrors)[0])?.focus());
    }
  }

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#dde9df] bg-white shadow-[0_18px_45px_rgba(24,66,56,.07)]">
      <div className="border-b border-[#e2ede5] bg-[#f7fbf7] px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#468066]">Step {step + 1} of 4</p><h2 className="mt-1 font-serif text-2xl text-[#173d39]">{steps[step]}</h2></div><button type="button" onClick={() => { setValues({ ...fictionalCataractExample }); setErrors({}); setStep(0); setFurthestStep(0); setExampleLoaded(true); }} className="inline-flex items-center gap-2 rounded-lg border border-[#b9d9c4] bg-white px-3 py-2 text-xs font-semibold text-[#235d48] hover:bg-[#e7f5eb]"><Sparkles size={16} aria-hidden="true" />Autofill fictional cataract example</button></div>
        <nav aria-label="Onboarding steps" className="mt-5 grid grid-cols-4 gap-1 sm:gap-2">{steps.map((name, index) => <button key={name} type="button" disabled={index > furthestStep} aria-current={index === step ? "step" : undefined} onClick={() => { setStep(index); setErrors({}); }} className={`min-w-0 rounded-lg px-1 py-2 text-center text-[10px] font-semibold sm:text-xs ${index === step ? "bg-[#195442] text-white" : index <= furthestStep ? "bg-[#e1f1e6] text-[#245b46] hover:bg-[#d0e9d8]" : "bg-[#edf1ec] text-[#789083]"}`}><span className="block sm:inline">{index + 1}.</span> {name}</button>)}</nav></div>
      <form action={formAction} onSubmit={handleSubmit} noValidate className="px-5 py-7 sm:px-8 sm:py-8">
        <input type="hidden" name="payload" value={JSON.stringify(values)} />{editId && <input type="hidden" name="editId" value={editId} />}
        {exampleLoaded && <p className="mb-5 rounded-lg bg-[#e9f6ed] px-4 py-3 text-xs text-[#275d43]" role="status">Fictional example loaded. Please review each step; consent remains unchecked.</p>}
        {step === 0 && <div className="grid gap-5"><p className="text-sm leading-6 text-[#607669]">Tell us the service you want cost information for. Avoid detailed diagnoses or real patient identifiers in this demo.</p>
          <TextField id="procedureName" label="Procedure or service name" value={values.procedureName} onChange={(v) => setValue("procedureName", v)} error={errorFor("procedureName")} placeholder="e.g. Cataract procedure for one eye" maxLength={120} />
          <TextField id="medicalSpecialty" label="Medical specialty" value={values.medicalSpecialty} onChange={(v) => setValue("medicalSpecialty", v)} error={errorFor("medicalSpecialty")} placeholder="e.g. Ophthalmology" maxLength={80} />
          <div className="grid gap-5 sm:grid-cols-2"><TextField id="mbsItemNumber" label="MBS item number (optional)" value={values.mbsItemNumber} onChange={(v) => setValue("mbsItemNumber", v)} error={errorFor("mbsItemNumber")} hint="An item number does not establish eligibility or your final cost." inputMode="numeric" maxLength={6} /><label className="flex items-start gap-3 rounded-xl border border-[#dce8df] bg-[#f7fbf7] p-4 text-sm text-[#244b3d]"><input id="mbsClinicianConfirmed" type="checkbox" checked={values.mbsClinicianConfirmed} onChange={(e) => setValue("mbsClinicianConfirmed", e.target.checked)} className="mt-1 h-4 w-4 accent-[#276b54]" /><span><strong className="block">Treating clinician confirmed this item</strong><small className="mt-1 block leading-5 text-[#657d6e]">Only tick if the clinician confirmed the number above.</small></span></label></div>
          <div className="grid gap-5 sm:grid-cols-[1fr_110px_130px]"><TextField id="suburb" label="General suburb or town" value={values.suburb} onChange={(v) => setValue("suburb", v)} error={errorFor("suburb")} maxLength={80} /><SelectField id="state" label="State" value={values.state} onChange={(v) => setValue("state", v as OnboardingValues["state"])} options={["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"].map((v) => ({ value: v, label: v }))} error={errorFor("state")} /><TextField id="postcode" label="Postcode" value={values.postcode} onChange={(v) => setValue("postcode", v)} error={errorFor("postcode")} inputMode="numeric" maxLength={4} /></div>
          <SelectField id="referralStatus" label="Referral or written treatment plan" value={values.referralStatus} onChange={(v) => setValue("referralStatus", v as OnboardingValues["referralStatus"])} error={errorFor("referralStatus")} options={[{ value: "UNKNOWN", label: "Not sure" }, { value: "REFERRAL", label: "I have a referral" }, { value: "TREATMENT_PLAN", label: "I have a written treatment plan" }, { value: "BOTH", label: "I have both" }, { value: "NEITHER", label: "Neither yet" }]} />
        </div>}
        {step === 1 && <div className="grid gap-5"><p className="text-sm leading-6 text-[#607669]">Only enter cover details you know. We will not ask for Medicare numbers or insurance membership IDs.</p>
          <SelectField id="medicareEligibility" label="Medicare eligibility" value={values.medicareEligibility} onChange={(v) => setValue("medicareEligibility", v as OnboardingValues["medicareEligibility"])} options={[{ value: "UNKNOWN", label: "Unknown" }, { value: "YES", label: "Yes" }, { value: "NO", label: "No" }]} error={errorFor("medicareEligibility")} />
          <TextField id="insurerName" label="Private insurer name (optional)" value={values.insurerName} onChange={(v) => setValue("insurerName", v)} error={errorFor("insurerName")} placeholder="Leave blank if none or unknown" maxLength={80} />
          <TextField id="hospitalCoverTier" label="Hospital cover tier (if known)" value={values.hospitalCoverTier} onChange={(v) => setValue("hospitalCoverTier", v)} error={errorFor("hospitalCoverTier")} placeholder="e.g. Gold, Silver, Bronze or Basic" maxLength={80} />
          <TextField id="policyDetails" label="Other policy details (optional)" value={values.policyDetails} onChange={(v) => setValue("policyDetails", v)} error={errorFor("policyDetails")} hint="General wording only. Do not enter a membership ID or policy number." maxLength={200} />
          <div className="grid gap-5 sm:grid-cols-2"><TextField id="excessDollars" label="Known excess (A$)" value={values.excessDollars} onChange={(v) => setValue("excessDollars", v)} error={errorFor("excessDollars")} inputMode="decimal" placeholder="Unknown" /><TextField id="copaymentDollars" label="Known co-payment (A$)" value={values.copaymentDollars} onChange={(v) => setValue("copaymentDollars", v)} error={errorFor("copaymentDollars")} inputMode="decimal" placeholder="Unknown" /></div>
          <SelectField id="coverageVerification" label="Has your insurer confirmed this cover?" value={values.coverageVerification} onChange={(v) => setValue("coverageVerification", v as OnboardingValues["coverageVerification"])} options={[{ value: "NOT_CONFIRMED", label: "Not confirmed" }, { value: "CONFIRMED", label: "Yes, I have checked with my insurer" }]} error={errorFor("coverageVerification")} hint="Your answer is recorded as patient-reported. MediFair AI does not verify or guarantee benefits." />
        </div>}
        {step === 2 && <div className="grid gap-5"><p className="text-sm leading-6 text-[#607669]">Preferences guide a shortlist. Specialist practices may differ in clinical suitability; check this with your treating clinician.</p>
          <div className="grid gap-5 sm:grid-cols-2"><TextField id="preferredLocation" label="Preferred location" value={values.preferredLocation} onChange={(v) => setValue("preferredLocation", v)} error={errorFor("preferredLocation")} placeholder="e.g. Sydney" maxLength={80} /><TextField id="travelDistanceKm" label="Maximum travel distance (km, optional)" value={values.travelDistanceKm} onChange={(v) => setValue("travelDistanceKm", v)} error={errorFor("travelDistanceKm")} inputMode="numeric" placeholder="No limit set" /></div>
          <TextField id="budgetDollars" label="Budget (A$, optional)" value={values.budgetDollars} onChange={(v) => setValue("budgetDollars", v)} error={errorFor("budgetDollars")} inputMode="decimal" hint="This is a preference, not an estimate of your final cost." />
          <div className="grid gap-5 sm:grid-cols-2"><TextField id="preferredProviderName" label="Preferred provider (optional)" value={values.preferredProviderName} onChange={(v) => setValue("preferredProviderName", v)} error={errorFor("preferredProviderName")} maxLength={100} /><TextField id="preferredHospitalName" label="Preferred hospital (optional)" value={values.preferredHospitalName} onChange={(v) => setValue("preferredHospitalName", v)} error={errorFor("preferredHospitalName")} maxLength={100} /></div>
          <div className="grid gap-5 sm:grid-cols-2"><TextField id="accessibilityNotes" label="Accessibility considerations (optional)" value={values.accessibilityNotes} onChange={(v) => setValue("accessibilityNotes", v)} error={errorFor("accessibilityNotes")} hint="Keep this general; do not include a diagnosis." maxLength={160} /><TextField id="languagePreference" label="Language preference (optional)" value={values.languagePreference} onChange={(v) => setValue("languagePreference", v)} error={errorFor("languagePreference")} maxLength={80} /></div>
        </div>}
        {step === 3 && <div className="grid gap-5"><div className="rounded-xl border border-[#dce8df] bg-[#f7fbf7] p-5"><h3 className="text-base font-semibold">Review your fictional case</h3><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-[#687e70]">Service</dt><dd className="font-semibold">{values.procedureName || "Not entered"}</dd></div><div><dt className="text-[#687e70]">Specialty</dt><dd className="font-semibold">{values.medicalSpecialty || "Not entered"}</dd></div><div><dt className="text-[#687e70]">Location</dt><dd className="font-semibold">{values.suburb || "Not entered"}, {values.state} {values.postcode}</dd></div><div><dt className="text-[#687e70]">Private insurer</dt><dd className="font-semibold">{values.insurerName || "Not provided"}</dd></div><div><dt className="text-[#687e70]">Preferred area</dt><dd className="font-semibold">{values.preferredLocation || "Not entered"}</dd></div><div><dt className="text-[#687e70]">MBS item</dt><dd className="font-semibold">{values.mbsItemNumber || "Not provided"}</dd></div></dl><button type="button" onClick={() => setStep(0)} className="mt-4 text-xs font-semibold text-[#22684f] underline">Edit procedure details</button></div>
          <div className="rounded-xl border border-[#dce8df] p-5 text-sm leading-6 text-[#4f695a]"><h3 className="font-semibold text-[#244b3d]">How this demo uses your answers</h3><ul className="mt-2 list-disc space-y-2 pl-5"><li>MediFair AI may prepare draft quote request emails and analyse synthetic replies.</li><li>You must separately approve the exact recipient and text before each outbound message. Saving this case sends nothing.</li><li>A practice may require a consultation before giving a personalised quote.</li><li>This demo does not collect detailed diagnoses, Medicare numbers or membership IDs.</li></ul></div>
          <label className="flex items-start gap-3 rounded-xl border border-[#dce8df] p-4 text-sm"><input id="demoAcknowledged" type="checkbox" checked={values.demoAcknowledged} onChange={(e) => setValue("demoAcknowledged", e.target.checked)} className="mt-1 h-4 w-4 accent-[#276b54]" aria-invalid={Boolean(errorFor("demoAcknowledged"))} /><span>I confirm these details are fictional and contain no real patient information.{errorFor("demoAcknowledged") && <small className="mt-1 block text-[#a23a31]">{errorFor("demoAcknowledged")}</small>}</span></label>
          <label className="flex items-start gap-3 rounded-xl border border-[#dce8df] p-4 text-sm"><input id="consent" type="checkbox" checked={values.consent} onChange={(e) => setValue("consent", e.target.checked)} className="mt-1 h-4 w-4 accent-[#276b54]" aria-invalid={Boolean(errorFor("consent"))} /><span>I consent to saving this fictional case and preparing draft messages or analysing synthetic replies. I understand each send needs my separate approval.{errorFor("consent") && <small className="mt-1 block text-[#a23a31]">{errorFor("consent")}</small>}</span></label>
        </div>}
        {actionState.message && <p role="alert" className="mt-5 rounded-lg bg-[#fff0eb] p-3 text-sm text-[#934338]">{actionState.message}</p>}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4ece5] pt-6"><button type="button" disabled={step === 0 || pending} onClick={() => { setStep(step - 1); setErrors({}); }} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[#2e624d] disabled:opacity-40"><ArrowLeft size={16} aria-hidden="true" />Back</button>{step < 3 ? <button type="button" onClick={nextStep} className="button button-primary">Continue<ArrowRight size={16} aria-hidden="true" /></button> : <button type="submit" disabled={pending} className="button button-primary disabled:opacity-50">{pending ? "Saving…" : editId ? "Save changes" : "Save case and view providers"}<Check size={16} aria-hidden="true" /></button>}</div>
      </form>
    </div>
    <aside className="grid gap-4"><div className="rounded-2xl border border-[#dce8df] bg-[#eaf4ec] p-5"><span className="badge">DEMO ONLY</span><h2 className="mt-4 font-serif text-xl">Your details stay in a synthetic workspace.</h2><p className="mt-3 text-xs leading-6 text-[#5d7766]">Use fictional details only. No emails are sent by this form. Unknown fees or benefits remain unknown.</p></div><div className="rounded-2xl border border-[#e1e8df] bg-white p-5"><h2 className="text-sm font-semibold">What happens next?</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-[#677d6b]"><li>Review your saved case summary.</li><li>See the fictional practice shortlist.</li><li>Future quote requests would need your approval one by one.</li></ol></div></aside>
  </div>;
}
