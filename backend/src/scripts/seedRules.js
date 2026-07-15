/**
 * Loads every JSON file in src/data/rules into the SchemeRule collection.
 * Run with: npm run seed
 *
 * Adding a new scheme to the system is just dropping a new JSON file in
 * src/data/rules and re-running this script — no code changes needed.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const connectDB = require("../config/db");
const SchemeRule = require("../models/SchemeRule");

const RULES_DIR = path.join(__dirname, "..", "data", "rules");

async function seed() {
  await connectDB(process.env.MONGODB_URI);

  const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.warn(`No rule JSON files found in ${RULES_DIR}`);
  }

  for (const file of files) {
    const raw = fs.readFileSync(path.join(RULES_DIR, file), "utf-8");
    let ruleDoc;
    try {
      ruleDoc = JSON.parse(raw);
    } catch (err) {
      console.error(`Skipping ${file}: invalid JSON (${err.message})`);
      continue;
    }

    await SchemeRule.findOneAndUpdate({ scheme_id: ruleDoc.scheme_id }, ruleDoc, {
      upsert: true,
      new: true,
    });
    console.log(`Seeded: ${ruleDoc.scheme_id} (${file})`);
  }

  console.log("Seeding complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
