const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

const LANGUAGE_NAMES = { en: "English", hi: "Hindi", gu: "Gujarati" };

/**
 * Extract a structured citizen profile from free-text query.
 *
 * The system instruction is deliberately restrictive: the model's ONLY
 * job is extraction, never eligibility reasoning. It must return null for
 * anything not stated or directly inferable — it must never guess a
 * plausible-sounding value to fill a gap, since that's exactly the kind
 * of fabrication the rule-grounded design is meant to prevent.
 *
 * @param {string} queryText
 * @param {string} language - "en" | "hi" | "gu"
 * @param {string[]} relevantFields - which fields matter for the scheme in question
 * @returns {Promise<object>} extracted profile, keys limited to relevantFields
 */
async function extractProfile(queryText, language, relevantFields) {
  const fieldList = relevantFields.join(", ");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: queryText,
    config: {
      systemInstruction: `You extract structured citizen attributes from a government scheme
query written in ${LANGUAGE_NAMES[language] || language}. You will be given a
list of relevant fields. Extract ONLY values that are explicitly stated or
directly and unambiguously inferable from the query text.

Rules:
- If a field's value is not present in the query, its value MUST be null.
  Do not guess, estimate, or assume a "typical" value.
- Do not reason about whether the person is eligible for anything — that is
  not your job.
- Respond with ONLY a raw JSON object, no markdown fences, no commentary.
- The JSON object's keys must be exactly: ${fieldList}`,
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (err) {
    throw new Error(`Failed to parse extraction output as JSON: ${response.text}`);
  }
}

/**
 * Convert a symbolic verdict into a natural-language response, WITHOUT
 * letting the model introduce any criterion that isn't in the verdict
 * object. This is the grounding constraint that keeps the hybrid
 * pipeline's hallucination rate low relative to plain RAG.
 *
 * @param {object} verdict - { scheme_id, eligible, passed_clauses, failed_clauses }
 * @param {string} language
 * @param {string} schemeName
 * @returns {Promise<string>}
 */
async function generateGroundedResponse(verdict, language, schemeName) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Scheme: ${schemeName}\nVerdict object: ${JSON.stringify(verdict)}`,
    config: {
      systemInstruction: `You write a short, plain-language response in ${LANGUAGE_NAMES[language] || language}
for a citizen checking their eligibility for a government scheme, based on a
verdict object you will be given.

Strict rules:
- You may ONLY reference the scheme name and the clauses listed in
  passed_clauses / failed_clauses of the verdict object.
- Do NOT mention, imply, or invent any eligibility criterion that is not
  present in the verdict object, even if you believe it to be true of real
  schemes.
- If eligible is true, say so clearly and briefly note 1-2 key clauses met.
- If eligible is false, clearly say so and explain which specific clause(s)
  failed, using the "description" field of each failed clause.
- Keep the tone plain, respectful, and free of bureaucratic jargon. Avoid
  words like "scheme_id" or "clause" — describe things naturally.
- Respond with only the message text, no preamble.`,
    },
  });

  return response.text.trim();
}

/**
 * Naive RAG baseline: summarize raw scheme text into an eligibility
 * judgment with no rule engine involved at all. This is deliberately the
 * "unsafe" comparator the paper measures against.
 *
 * @param {string} queryText
 * @param {string} language
 * @param {string} sourceText - raw scheme description text
 * @param {string} schemeName
 * @returns {Promise<string>}
 */
async function generateRagResponse(queryText, language, sourceText, schemeName) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Scheme: ${schemeName}\n\nScheme description:\n${sourceText}\n\nCitizen query:\n${queryText}`,
    config: {
      systemInstruction: `You are a helpful assistant answering a citizen's question about
whether they qualify for a government scheme, using only the retrieved
scheme description text provided. Respond in ${LANGUAGE_NAMES[language] || language}.
Read the citizen's query, compare it against the scheme text, and give your
best judgment on their eligibility along with your reasoning. Keep it brief
and in plain language.`,
    },
  });

  return response.text.trim();
}

module.exports = { extractProfile, generateGroundedResponse, generateRagResponse };
