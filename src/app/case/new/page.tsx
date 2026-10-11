import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-elements";
import { getEditableOnboardingCase } from "@/lib/db/onboarding";
import { OnboardingForm } from "./onboarding-form";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  let initialValues;
  if (edit) {
    await connection();
    initialValues = await getEditableOnboardingCase(edit);
    if (!initialValues) notFound();
  }
  return <>
    <PageHeading eyebrow={edit ? "EDIT FICTIONAL CASE" : "START HERE"} title={edit ? "Edit your case" : "Create a new case"} description="Four short steps to organise a specialist cost enquiry. Use fictional details only in this demo." />
    <OnboardingForm initialValues={initialValues ?? undefined} editId={edit} />
  </>;
}
