# Australian official source registry

Retrieved and reviewed on **11 October 2026 (Australia/Sydney)**. “Effective date not stated” means the page does not provide a single date that can safely govern all facts on it. Recheck before using changing fees, rules, or policy claims. Links in this registry are references, not integration endpoints; do not scrape them or assume an API.

| Exact URL | Publisher | Retrieval date | Effective date / page date | Supports | Limits |
| --- | --- | --- | --- | --- | --- |
| https://medicalcostsfinder.health.gov.au/ | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | Effective date not stated | The Medical Costs Finder shows typical costs and indicative participating specialist fees. | Its own page calls this a guide, not a quote or diagnosis. |
| https://www.healthdirect.gov.au/ | Healthdirect Australia Limited | 11 Oct 2026 | Effective date not stated on page | Homepage links to the Healthdirect service finder for manual search. | A listing does not verify the exact procedure, practice email, or clinical suitability. No directory API access is assumed. |
| https://www.ahpra.gov.au/ | Australian Health Practitioner Regulation Agency | 11 Oct 2026 | Effective date not stated on homepage; the public register is accessible through the site | The site offers a public practitioner registration search. | Registration does not verify a practice email, hospital association or procedure availability. The homepage blocked direct automated retrieval during this review; search-indexed Ahpra pages were checked. |
| https://medicalcostsfinder.health.gov.au/guide-to-costs/ | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | Effective date not stated | Providers set their fees; an out-of-pocket amount is what the patient pays. Patients can ask specialists for written estimates and ask insurers about cover, waiting periods, excesses, and gap arrangements. | A specific patient's gap depends on their circumstances. Do not derive one from a benchmark. |
| https://www.mbsonline.gov.au/ | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | No single effective date; home page last updated 4 Aug 2025; item-specific schedule dates vary | The MBS lists Medicare-subsidised services and is updated when the Schedule changes. | Schedule fees are not provider fees or patient gaps. Check the current individual item and its effective date before using a fee. |
| https://www9.health.gov.au/mbs/fullDisplay.cfm?criteria=cataract&q=42702&type=item | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | Item description updated 1 Mar 2025; schedule fee updated 1 Jul 2026 | Item 42702 describes lens extraction and intraocular lens insertion. It is an illustrative reference for the fictional one-eye cataract case. | No schedule fee or benefit is copied into fictional quotes. The item does not confirm this fictional patient's eligibility, provider fee, insurer benefit or gap. |
| https://www.privatehealth.gov.au/ | Commonwealth Ombudsman, PrivateHealth.gov.au | 11 Oct 2026 | Effective date not stated | Independent private health insurance information, insurer details, and policy comparison resources. | URL redirects to `https://privatehealth.gov.au/`. General information cannot confirm an individual's benefits; ask the insurer for personalised cover. |
| https://www.ombudsman.gov.au/publications-and-news-pages/publication-pages/brochures-and-factsheets/factsheets/private-health-insurance/informed-financial-consent | Commonwealth Ombudsman | 11 Oct 2026 | Effective date not stated | Patients can ask treating providers, insurer, and hospital about fees and gaps before treatment; written estimates are preferable. It describes options when a bill is higher than expected. | It does not guarantee that a fee can be reduced or a complaint will succeed. |
| https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles | Office of the Australian Information Commissioner | 11 Oct 2026 | Effective date not stated on page | Text of the Australian Privacy Principles, including collection, use/disclosure, security, and cross-border disclosure obligations. | A privacy review is required before handling real health data; this registry is not legal advice. |
| https://www.health.gov.au/our-work/consultation-on-specialist-affordability-and-access | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | Effective date not applicable; page last updated 9 Sep 2026 | Government consultation on specialist fee transparency, referrals, and affordability. | These are reform consultations, not enacted rules. |

## Interpretation rules

- Record a provider's written fee, MBS schedule fee, Medicare benefit, private insurer benefit, other charges, and final patient gap as separate fields with source and confirmation status.
- A benchmark from Medical Costs Finder must be labelled “typical/indicative” and never ranked as a personal quote.
- If an insurer benefit, hospital charge, or other clinician fee is missing, show that missing coverage explicitly. Do not display an unsupported total or savings claim.
- Before any claim based on an MBS item, verify the current official item, service setting, and effective date. Do not infer clinical eligibility or coverage.

## Cost review engine additions — 11 October 2026

The rule-by-rule evidence matrix, effective-date handling and limitations are in [Australian billing rules](australian-billing-rules.md). Additional verified official URLs are:

| Exact URL | Publisher | Retrieval date | Effective date | Supports | Limits |
| --- | --- | --- | --- | --- | --- |
| https://www.ombudsman.gov.au/__data/assets/pdf_file/0016/35611/Doctors-Bill-DL-Fyler-Web.pdf | Commonwealth Ombudsman | 11 Oct 2026 | Not stated; older consumer brochure | Discuss higher-than-expected bills and payment difficulty with provider; ask for written response. | General guidance only; no entitlement, refund or error established. |
| https://www.mbsonline.gov.au/internet/mbsonline/publishing.nsf/Content/downloads | Australian Government Department of Health, Disability and Ageing | 11 Oct 2026 | File-specific | Dated MBS download listings. | November 2026 files appear on the page but are future-effective relative to 11 Oct 2026 and are not used. |
| https://privatehealth.gov.au/dynamic/insurer/gapdoctors | Commonwealth Ombudsman, PrivateHealth.gov.au | 11 Oct 2026 | Not stated | Doctor participation in gap cover is discretionary and case specific. | Direct page was inspected; no individual participation inferred. |
| https://www.ombudsman.gov.au/complaints/private-health-insurance-complaints | Commonwealth Ombudsman | 11 Oct 2026 | Not stated | Insurance arrangement complaint scope and insurer-first process. | Does not address unrelated clinical care or guarantee a result. |
| https://www.hccc.nsw.gov.au/contact-us | NSW Health Care Complaints Commission | 11 Oct 2026 | Not stated | NSW health service/practitioner complaint advice. | May not cover every billing dispute or order fee changes; NSW only. |
| https://www.health.nsw.gov.au/patientconcerns/Pages/feedback.aspx | NSW Health | 11 Oct 2026 | Page current as at 26 Feb 2026 | NSW public hospital feedback and complaint route. | NSW only; no mandatory deadline used. |


## Integration QA note — 11 October 2026

This pass used the existing recorded official-source evidence and did not make external requests, as required for mock-only QA. No new legal, Medicare, insurer or fee claim was introduced. Earlier retrieval dates and direct-access limitations above remain unchanged; this note is not a fresh verification. Recheck current official guidance and item-effective dates before live use. All newly exercised financial differences ($900 quoted reduction and $700 invoice increase) arise solely from labelled synthetic fixtures, not official schedule amounts or guaranteed entitlements.
