# Scheme Eligibility Checker — MERN Prototype

A research prototype implementing the three eligibility-determination
architectures described in *"Reliability of Conversational AI for
Government Scheme Eligibility Determination"*:

1. **RAG** — retrieves and summarizes raw scheme text (naive baseline)
2. **Rule-grounded hybrid** — extracts a structured profile, checks it
   against a machine-readable rule engine, then generates a response
   constrained to only the facts in the resulting verdict (the proposed system)
3. **Symbolic** — a pure form-based check equivalent to the existing
   filter-based government portal (accuracy ceiling comparator)

## Structure

```
backend/     Express + MongoDB API, the rule engine, and the three pipelines
frontend/    React (Vite) chat UI
```

## Setup

### Backend

```
cd backend
cp .env.example .env      # then fill in GEMINI_API_KEY and MONGODB_URI
npm install
npm run seed               # loads the sample scheme rules (PM-KISAN, NMMS Scholarship) into MongoDB
npm run dev                 # starts on http://localhost:5000
```

Get a `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/app/apikey) (free tier available). The default model is `gemini-flash-latest`; override via `GEMINI_MODEL` in `.env` if you want a specific version pinned instead.

You'll need a MongoDB instance running (local `mongod`, or a free Atlas
cluster — either works, just point `MONGODB_URI` at it).

### Frontend

```
cd frontend
npm install
npm run dev                 # starts on http://localhost:5173, proxies /api to the backend
```

## Adding a new scheme

Drop a new JSON rule file into `backend/src/data/rules/`, following the
shape of `pm-kisan.json` or `nmms-scholarship.json`, then re-run `npm run
seed`. No code changes needed — this is the whole point of keeping rules
as data rather than hardcoded logic, per the paper's design.

## Running the evaluation (for the paper's results section)

This repo ships the product-facing pieces (API + chat UI). For the
paper's actual accuracy / hallucination-rate / consistency numbers, pair
this with a separate evaluation script that:

1. Generates synthetic profiles per scheme (including boundary cases —
   see the rule engine's `getRequiredFields` to know which fields to vary)
2. Computes ground truth directly via `ruleEngine.getVerdict()`
3. Calls `POST /api/chat` once per system (`rag`, `hybrid`, `symbolic`)
   for each profile, in each of the three languages
4. Compares each system's answer against ground truth and against the
   rule corpus (for hallucination scoring)

See `Proposed_Methodology_and_Pseudocode.md` from earlier in this project
for the pseudocode of that harness — it's a separate script, not part of
this running app, since it's an offline evaluation tool rather than a
citizen-facing feature.

## Known simplifications (documented for the paper's limitations section)

- The RAG baseline uses simple full-text scheme descriptions rather than
  chunked retrieval over a larger corpus — fine for 2 example schemes,
  but a real RAG comparison would want many more schemes and an actual
  vector store.
- Only 2 example schemes are seeded. Scaling to "a representative set of
  central and state schemes" (per the abstract) means writing more rule
  JSON files — the engine and pipeline code doesn't change.
- Query logs (`QueryLog` model) currently retain the full extracted
  profile indefinitely — fine for a research eval run, but should be
  purged/anonymized before any real deployment.
