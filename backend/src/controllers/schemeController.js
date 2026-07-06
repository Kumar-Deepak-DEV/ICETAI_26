const SchemeRule = require("../models/SchemeRule");
const { getVerdict, getRequiredFields } = require("../ruleEngine/evaluate");

async function listSchemes(req, res) {
  const schemes = await SchemeRule.find({}, "scheme_id name category short_description").lean();
  res.json(schemes);
}

async function getSchemeRule(req, res) {
  const scheme = await SchemeRule.findOne({ scheme_id: req.params.schemeId }).lean();
  if (!scheme) return res.status(404).json({ error: "Scheme not found" });
  res.json(scheme);
}

async function getSchemeRequiredFields(req, res) {
  const scheme = await SchemeRule.findOne({ scheme_id: req.params.schemeId }).lean();
  if (!scheme) return res.status(404).json({ error: "Scheme not found" });
  const fields = Array.from(getRequiredFields(scheme));
  res.json({ scheme_id: scheme.scheme_id, required_fields: fields });
}

/**
 * Pure symbolic check — the filter-based-portal equivalent. No LLM
 * involved; the frontend collects the profile via a form and this just
 * runs the same rule engine directly.
 */
async function checkProfile(req, res) {
  const scheme = await SchemeRule.findOne({ scheme_id: req.params.schemeId }).lean();
  if (!scheme) return res.status(404).json({ error: "Scheme not found" });

  const { profile } = req.body;
  if (!profile || typeof profile !== "object") {
    return res.status(400).json({ error: "Request body must include a 'profile' object" });
  }

  const verdict = getVerdict(profile, scheme);
  res.json({ system: "symbolic", verdict });
}

module.exports = { listSchemes, getSchemeRule, getSchemeRequiredFields, checkProfile };
