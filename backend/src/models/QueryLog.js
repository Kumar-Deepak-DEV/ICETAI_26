const mongoose = require("mongoose");

// One row per /api/chat call. This is what the evaluation harness reads
// to compute accuracy, hallucination rate, and cross-language consistency
// (see paper's Methodology section 3.4) — no PII is retained beyond the
// profile fields needed for that analysis, and this table is meant to be
// purged/anonymized once evaluation runs are complete.
const QueryLogSchema = new mongoose.Schema(
  {
    system: { type: String, enum: ["rag", "hybrid", "symbolic"], required: true },
    language: { type: String, enum: ["en", "hi", "gu"], required: true },
    scheme_id: { type: String, required: true },
    query_text: String,
    extracted_profile: mongoose.Schema.Types.Mixed,
    verdict: mongoose.Schema.Types.Mixed,
    response_text: String,
    needs_clarification: { type: Boolean, default: false },
    missing_fields: [String],
    // Set only when the query originated from a synthetic evaluation
    // profile, so accuracy can be computed with a query instead of a
    // separate reconciliation step.
    ground_truth_label: { type: Boolean, default: null },
    ground_truth_profile_id: { type: String, default: null },
    latency_ms: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("QueryLog", QueryLogSchema);
