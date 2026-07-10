const express = require("express");
const { chat, completeHybrid } = require("../controllers/chatController");

const router = express.Router();

router.post("/", chat);
router.post("/complete", completeHybrid);

module.exports = router;
