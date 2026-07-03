require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");
const chatRoutes = require("./src/routes/chatRoutes");
const schemeRoutes = require("./src/routes/schemeRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/chat", chatRoutes);
app.use("/api/schemes", schemeRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const PORT = process.env.PORT || 5000;

async function start() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY is not set — hybrid and rag pipelines will fail until it is.");
  }
  await connectDB(process.env.MONGODB_URI || "mongodb://localhost:27017/scheme_eligibility");
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
