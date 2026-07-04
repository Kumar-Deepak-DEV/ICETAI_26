const mongoose = require("mongoose");
require("dotenv").config();

async function connectDB(uri = process.env.MONGODB_URI || "mongodb://localhost:27017/scheme_eligibility") {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = connectDB;
