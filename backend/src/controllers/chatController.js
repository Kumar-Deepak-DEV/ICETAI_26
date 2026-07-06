const SchemeRule = require("../models/SchemeRule");
const QueryLog = require("../models/QueryLog");
const { getVerdict, getRequiredFields } = require("../ruleEngine/evaluate");
const { extractProfile, generateGroundedResponse, generateRagResponse } = require("../services/llmService");

/**
 * POST /api/chat
 * body: { query_text, language, scheme_id, system: "rag" | "hybrid" | "symbolic" }
 *
 * Routes to the requested pipeline. Note that in ALL THREE pipelines,
 * eligibility itself is only ever decided by the rule engine (getVerdict) —
 * "rag" is the one exception, since simulating an ungrounded baseline is
 * the entire point of including it in the comparison.
 */
async function chat(req, res) {
  const startTime = Date.now();
  const { query_text, language, scheme_id, system } = req.body;

  if (!query_text || !language || !scheme_id || !system) {
    return res.status(400).json({ error: "query_text, language, scheme_id, and system are required" });
  }
  if (!["rag", "hybrid", "symbolic"].includes(system)) {
    return res.status(400).json({ error: "system must be one of: rag, hybrid, symbolic" });
  }

  const schemeRule = await SchemeRule.findOne({ scheme_id }).lean();
  if (!schemeRule) {
    return res.status(404).json({ error: `Unknown scheme_id: ${scheme_id}` });
  }

  try {
    if (system === "rag") {
      const responseText = await generateRagResponse(query_text, language, schemeRule.source_text, schemeRule.name);
      await logQuery({ system, language, scheme_id, query_text, response_text: responseText, startTime });
      return res.json({ system, response_text: responseText });
    }

    if (system === "hybrid") {
      return await runHybridPipeline({ query_text, language, scheme_id, schemeRule, startTime, res });
    }

    // system === "symbolic" — query_text is expected to be a JSON-stringified
    // profile submitted from a form, not natural language (see the
    // /api/schemes/:id/check-profile route for the pure form-based version;
    // this branch exists so /api/chat can serve as a single entry point too)
    let profile;
    try {
      profile = JSON.parse(query_text);
    } catch {
      return res.status(400).json({ error: "For system=symbolic, query_text must be a JSON profile object" });
    }
    const verdict = getVerdict(profile, schemeRule);
    await logQuery({ system, language, scheme_id, query_text, extracted_profile: profile, verdict, startTime });
    return res.json({ system, verdict });
  } catch (err) {
    console.error("chat() error:", err);
    return res.status(500).json({ error: "Internal error processing the request" });
  }
}

async function runHybridPipeline({ query_text, language, scheme_id, schemeRule, startTime, res }) {
  const requiredFields = Array.from(getRequiredFields(schemeRule));

  const profile = await extractProfile(query_text, language, requiredFields);

  const missingFields = requiredFields.filter((f) => profile[f] === null || profile[f] === undefined);

  if (missingFields.length > 0) {
    await logQuery({
      system: "hybrid",
      language,
      scheme_id,
      query_text,
      extracted_profile: profile,
      needs_clarification: true,
      missing_fields: missingFields,
      startTime,
    });
    return res.json({
      system: "hybrid",
      needs_clarification: true,
      missing_fields: missingFields,
      partial_profile: profile,
    });
  }

  const verdict = getVerdict(profile, schemeRule);
  const responseText = await generateGroundedResponse(verdict, language, schemeRule.name);

  await logQuery({
    system: "hybrid",
    language,
    scheme_id,
    query_text,
    extracted_profile: profile,
    verdict,
    response_text: responseText,
    startTime,
  });

  return res.json({ system: "hybrid", verdict, response_text: responseText });
}

/**
 * POST /api/chat/complete
 * body: { scheme_id, language, profile }
 *
 * Resumes the hybrid pipeline after a clarification form has been filled
 * in on the frontend. `profile` here is already-structured data (the
 * partial profile from extraction, merged with the citizen's form
 * answers) — so this skips extraction entirely and goes straight to the
 * rule engine + grounded generation. This avoids a second, redundant LLM
 * extraction call and the small risk of it misreading form-filled values.
 */
async function completeHybrid(req, res) {
  const startTime = Date.now();
  const { scheme_id, language, profile } = req.body;

  if (!scheme_id || !language || !profile) {
    return res.status(400).json({ error: "scheme_id, language, and profile are required" });
  }

  const schemeRule = await SchemeRule.findOne({ scheme_id }).lean();
  if (!schemeRule) {
    return res.status(404).json({ error: `Unknown scheme_id: ${scheme_id}` });
  }

  try {
    const verdict = getVerdict(profile, schemeRule);
    const responseText = await generateGroundedResponse(verdict, language, schemeRule.name);

    await logQuery({
      system: "hybrid",
      language,
      scheme_id,
      extracted_profile: profile,
      verdict,
      response_text: responseText,
      startTime,
    });

    return res.json({ system: "hybrid", verdict, response_text: responseText });
  } catch (err) {
    console.error("completeHybrid() error:", err);
    return res.status(500).json({ error: "Internal error processing the request" });
  }
}

async function logQuery(fields) {
  const { startTime, ...rest } = fields;
  try {
    await QueryLog.create({ ...rest, latency_ms: Date.now() - startTime });
  } catch (err) {
    // Logging failures should never break the user-facing response
    console.error("Failed to write query log:", err.message);
  }
}

module.exports = { chat, completeHybrid };
