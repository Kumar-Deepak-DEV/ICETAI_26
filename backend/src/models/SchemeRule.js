const mongoose = require("mongoose");

// The rule tree itself is stored as Mixed/nested schema since its shape is
// recursive (AND/OR/NOT composites nesting leaves and other composites).
// Validation of the tree's structural correctness happens in the rule
// engine and in the seed script, not here — Mongoose just stores it as data.
const RuleNodeSchema = new mongoose.Schema(
  {
    id: String,
    field: String,
    op: String,
    value: mongoose.Schema.Types.Mixed,
    description: String,
    logic: String,
    clauses: [mongoose.Schema.Types.Mixed],
  },
  { _id: false, strict: false }
);

const SchemeRuleSchema = new mongoose.Schema(
  {
    scheme_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true }, // agriculture | education | social_welfare
    short_description: { type: String, required: true },
    // Raw scheme text used by the RAG baseline for retrieval
    source_text: { type: String, required: true },
    logic: { type: String, required: true }, // root logic operator, "AND" | "OR"
    clauses: { type: [RuleNodeSchema], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SchemeRule", SchemeRuleSchema);
