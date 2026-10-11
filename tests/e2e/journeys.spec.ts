import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function approveAndSendNegotiation(page: Page) {
  const review = page.getByRole("button", { name: "Review for approval", exact: true });
  await expect(page.getByRole("button", { name: /Review for approval|Approve exact email/ }).first()).toBeVisible();
  if (await review.isVisible()) await review.click();
  await expect(page.getByRole("button", { name: "Approve exact email", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve exact email", exact: true }).click();
  await page.getByLabel("I confirm this separate send action").check();
  await page.getByRole("button", { name: "Send approved request", exact: true }).click();
  await expect(page.getByText("SIMULATED SENT", { exact: false }).first()).toBeVisible();
}

// Browser traffic must stay local. Real SDK paths are exercised only by unit/integration mocks.
test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
    return route.continue();
  });
});

test("same new case: onboarding → three quotes → clarification → negotiation → revised comparison → bill review", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your healthcare cost dashboard" })).toBeVisible();
  await page.getByRole("link", { name: "Start a new case", exact: true }).click();
  await page.getByRole("button", { name: "Autofill fictional cataract example" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Known co-payment (A$)").fill("0");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Private insurer name (optional)")).toHaveValue("DemoCover (fictional)");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#demoAcknowledged").check(); await page.locator("#consent").check();
  await page.getByRole("button", { name: "Save case and view providers" }).click();
  await expect(page).toHaveURL(/providers\?case=/);
  const caseId = new URL(page.url()).searchParams.get("case")!;
  for (const slug of ["harbour", "north", "city"]) await page.locator(`#practice-demo-provider-${slug}`).check();
  await page.getByRole("button", { name: "Save shortlist", exact: true }).click();
  await page.getByRole("link", { name: "Review quote-request drafts" }).click();
  await expect(page.getByRole("heading", { name: "Quote request drafts", exact: true })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(3);
  for (const article of await page.locator("article").all()) {
    await article.getByRole("checkbox").check();
    await article.getByRole("button", { name: "Approve this draft" }).click();
    await expect(article.locator(".badge")).toContainText("approved");
  }
  await expect(page.locator("#send-heading").locator("..").getByText("ready", { exact: true })).toHaveCount(3);
  await page.getByLabel("I want to create simulated messages for these approved drafts.", { exact: false }).check();
  await page.getByRole("button", { name: "Send approved requests", exact: true }).click();
  await expect(page.locator("#send-heading").locator("..").getByText("simulated", { exact: true })).toHaveCount(3);
  for (const [provider, template] of [["harbour", "baseline-harbour"], ["north", "baseline-north"], ["city", "missing-anaesthetist"]]) {
    await page.goto(`/dev/email-simulator?case=${caseId}`);
    await page.getByLabel("Fictional specialist practice", { exact: true }).selectOption(`demo-provider-${provider}`);
    await page.getByLabel("Synthetic response template").selectOption(template);
    await page.getByRole("button", { name: "Simulate Provider Reply", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Synthetic reply added" })).toBeVisible();
  }
  await page.goto(`/quote-analysis?case=${caseId}`);
  await expect(page.getByText("Simulated extraction", { exact: false }).first()).toBeVisible();
  await page.goto(`/comparison?case=${caseId}`);
  const quoteLinks = await page.getByRole("link", { name: "Open quote", exact: false }).evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(quoteLinks).toHaveLength(3);
  for (const href of quoteLinks) {
    await page.goto(href);
    if (await page.getByRole("heading", { name: "Review synthetic scenario evidence" }).count()) {
      await page.getByLabel("I reviewed the fictional clinician-confirmed", { exact: false }).check();
      await page.getByLabel("I reviewed the synthetic DemoCover", { exact: false }).check();
      await page.getByLabel("Evidence review note").fill("Reviewed the synthetic scope and DemoCover confirmation supplied in the fixture.");
      await page.getByRole("button", { name: "Record simulated evidence review" }).click();
      await expect(page.getByRole("heading", { name: "Review synthetic scenario evidence" })).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Save follow-up draft" }).click();
      await expect(page).toHaveURL(/requests\?case=/);
    }
  }
  await page.goto(`/comparison?case=${caseId}`);
  await expect(page.getByText("$1,800.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Incomplete quote", { exact: false }).first()).toBeVisible();
  await page.goto(`/opportunities?case=${caseId}`);
  await expect(page.getByText("gap-cover", { exact: false }).first()).toBeVisible();
  await page.goto(`/negotiation?case=${caseId}`);
  const opportunities = page.getByLabel("Opportunity to address");
  const northGap = await opportunities.locator("option").evaluateAll((items) => items.find((item) => /gap.cover/i.test(item.textContent ?? "") && /Northside/i.test(item.textContent ?? ""))?.getAttribute("value"));
  expect(northGap).toBeTruthy(); await opportunities.selectOption(northGap!);
  await page.getByRole("button", { name: "Create editable request" }).click();
  await approveAndSendNegotiation(page);
  const negotiationUrl = page.url();
  await page.goto(`/dev/email-simulator?case=${caseId}`);
  await page.getByLabel("Synthetic outcome").selectOption("agrees-discount");
  await page.getByRole("heading", { name: "Simulate a negotiation response" }).locator("..").getByRole("button", { name: "Simulate Provider Reply" }).click();
  await expect(page.getByText("Synthetic negotiation reply added", { exact: false })).toBeVisible();
  await page.goto(negotiationUrl);
  await expect(page.getByText("FICTIONAL · ACCEPTED", { exact: true })).toBeVisible();
  await expect(page.getByText("Potential quoted reduction", { exact: true }).locator("..")).toContainText("$900.00");
  await page.getByRole("link", { name: "Open revised quote version" }).click();
  await expect(page.getByRole("link", { name: /Version 1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Version 2/ })).toBeVisible();

  await page.goto(`/documents?case=${caseId}`);
  for (const [file, kind] of [["synthetic-original-estimate.pdf", "SPECIALIST_ESTIMATE"], ["synthetic-final-invoice.pdf", "FINAL_INVOICE"]]) {
    await page.getByLabel("Document type", { exact: true }).selectOption(kind);
    await page.getByLabel("Practice, if relevant").selectOption("demo-provider-harbour");
    await page.getByLabel("PDF file", { exact: true }).setInputFiles(resolve("output/pdf", file));
    await page.getByLabel("I confirm this PDF contains synthetic demo data", { exact: false }).check();
    await page.getByRole("button", { name: "Upload and analyse" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Synthetic PDF analysed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: file, exact: true })).toBeVisible();
  }
  await page.getByLabel("Previous quote", { exact: false }).selectOption({ label: "synthetic-original-estimate.pdf" });
  await page.getByLabel("Final invoice", { exact: true }).selectOption({ label: "synthetic-final-invoice.pdf" });
  await page.getByRole("button", { name: "Compare selected PDFs" }).click();
  await expect(page.getByText("Change: $700.00", { exact: true }).first()).toBeVisible();
  await page.locator("ol > li").filter({ hasText: "Change: $700.00" }).first().getByRole("button", { name: "Save review opportunity" }).click();
  await page.getByRole("button", { name: "Start negotiation draft" }).click();
  await expect(page).toHaveURL(new RegExp(`negotiation\\?case=${caseId}`));
  await approveAndSendNegotiation(page);
  const billUrl = page.url();
  await page.goto(`/dev/email-simulator?case=${caseId}`);
  await page.getByLabel("Synthetic outcome").selectOption("more-info");
  await page.getByRole("heading", { name: "Simulate a negotiation response" }).locator("..").getByRole("button", { name: "Simulate Provider Reply" }).click();
  await expect(page.getByText("Synthetic negotiation reply added", { exact: false })).toBeVisible();
  await page.goto(billUrl);
  await expect(page.getByText("FICTIONAL · NEEDS CLARIFICATION", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close this negotiation" }).click();
  await expect(page.getByText("FICTIONAL · CLOSED", { exact: true })).toBeVisible();
  await page.goto(`/settings?case=${caseId}`);
  await page.getByLabel("I confirm I want to reset the sample case", { exact: false }).check();
  await page.getByRole("button", { name: "Reset Demo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Other cases and their records were preserved");
  await page.goto(`/?case=${caseId}`);
  await expect(page.getByText("$900.00 potential quoted reduction", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile navigation, service status and local security gates", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/providers", "/comparison", "/documents", "/opportunities", "/negotiation", "/inbox", "/settings"]) {
    await page.goto(`${path}?case=demo-case`);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mobile overflow on ${path}`).toBeTruthy();
  }
  await page.screenshot({ path: "test-results/mobile-settings.png", fullPage: true });
  expect((await request.post("/api/resend/webhook", { data: {} })).status()).toBe(404);
  expect((await request.get("/dev/email-simulator", { headers: { host: "public.example" } })).status()).toBe(403);
  expect((await request.post("/settings", { headers: { origin: "https://public.example" } })).status()).toBe(403);
});
