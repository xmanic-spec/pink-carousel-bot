// intel.js — consumer module that daily.js requires. Returns "" if no brief yet.
const fs = require("fs");
const path = require("path");
const LATEST = path.join(__dirname, "intel", "latest.json");
function summary() {
  try {
    const j = JSON.parse(fs.readFileSync(LATEST, "utf8"));
    if (!j.briefing) return "";
    return "MARKET INTEL BRIEFING (refreshed " + j.date + "):\n" + j.briefing + "\n\nLEARNING INSTRUCTION: weight today choice toward the TRENDING ANGLES and HOOK PATTERNS above. Use the ONE STRONG RECOMMENDATION as the default starting point if it fits and is not over-covered. Treat AVOID as hard exclusions for today.";
  } catch (_) { return ""; }
}
module.exports = { summary };
if (require.main === module) process.stdout.write(summary());
