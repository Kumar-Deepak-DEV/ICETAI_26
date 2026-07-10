const express = require("express");
const {
  listSchemes,
  getSchemeRule,
  getSchemeRequiredFields,
  checkProfile,
} = require("../controllers/schemeController");

const router = express.Router();

router.get("/", listSchemes);
router.get("/:schemeId/rule", getSchemeRule);
router.get("/:schemeId/required-fields", getSchemeRequiredFields);
router.post("/:schemeId/check-profile", checkProfile);

module.exports = router;
