import OpenAI from "openai";
import { z } from "zod";
import { buildQuoteRequestDraft, type QuoteDraftFacts } from "./quote-request-template";

const toneSchema = z.enum(["warm", "direct"]);

// AI chooses a style only. The actual text is assembled from reviewed templates,
// so a model response cannot introduce clinical facts or drop cost questions.
export async function personaliseSyntheticDraft(facts: QuoteDraftFacts) {
  if (process.env.DEMO_MODE === "false") throw new Error("AI personalisation is restricted to synthetic demo cases.");
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "mock";
  if (provider === "mock") return buildQuoteRequestDraft(facts, "direct");
  if (provider !== "openai") throw new Error(`Unsupported AI_PROVIDER: ${provider}.`);
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) throw new Error("AI_PROVIDER=openai requires OPENAI_API_KEY and OPENAI_MODEL. Mock mode is not used as a fallback.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL,
    store: false,
    input: [
      { role: "system", content: "Choose only one word: warm or direct. You are selecting the tone of an introductory sentence in a synthetic Australian medical quote request. Do not write any patient facts or email text." },
      { role: "user", content: "Choose a clear, respectful tone for a fictional cost enquiry." },
    ],
    max_output_tokens: 16,
  });
  const tone = toneSchema.parse(response.output_text.trim().toLowerCase());
  return buildQuoteRequestDraft(facts, tone);
}
