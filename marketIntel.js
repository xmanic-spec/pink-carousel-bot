// marketIntel.js — daily web research that feeds daily.js with what is trending NOW
// in AI content, which hooks are landing, and what is over-covered. Output: intel/<date>.json
// + intel/latest.json. Pure additive layer. Never throws into the publish pipeline.
const fs = require("fs");
const path = require("path");
const key = process.env.ANTHROPIC_API_KEY;
const DATE = new Date().toISOString().slice(0, 10);
const DIR = path.join(__dirname, "intel");
fs.mkdirSync(DIR, { recursive: true });

async function anthropic(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Anthropic API " + res.status + ": " + JSON.stringify(j));
  return j;
}

const SYSTEM = "You are the market-intelligence layer for an Israeli AI and marketing IG account (@bankhaltershay, Pink Media). Once a day you produce a SHORT, ACTIONABLE briefing that the content generator consumes the same day. The briefing must help the generator pick a more shareable, more on-trend AI story.\n\nOUTPUT a compact Hebrew text briefing, 8-15 short lines, with these sections in this exact order:\n1) TRENDING AI ANGLES (last 72h): 3-5 specific story angles you found in real news or social right now. One line each. Concrete subjects with names, never generic categories.\n2) HOOK PATTERNS WINNING NOW: 2-3 concrete hook structures resonating in marketing/AI content this cycle.\n3) AVOID: 1-2 angles that are over-covered and likely to underperform now.\n4) ONE STRONG RECOMMENDATION: one specific topic for today, plus its share trigger (capability shock / time saved / contrarian / news so-what / status) and one line why.\n\nUse real, current, verifiable subjects (model names, products, companies, launches). No vague language, no fluff, no markdown, no em dashes. Output ONLY the briefing text.";

(async () => {
  if (!key) { console.error("marketIntel: no ANTHROPIC_API_KEY, skipping"); return; }
  try {
    const j = await anthropic({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: "Today is " + DATE + ". Build the briefing for the @bankhaltershay AI/marketing IG content engine. Focus on AI tools, AI news, AI for marketing and business. Output ONLY the briefing." }],
    });
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!text) { console.error("marketIntel: empty response"); return; }
    const payload = { date: DATE, briefing: text };
    fs.writeFileSync(path.join(DIR, DATE + ".json"), JSON.stringify(payload, null, 2));
    fs.writeFileSync(path.join(DIR, "latest.json"), JSON.stringify(payload, null, 2));
    console.log("marketIntel: wrote " + text.length + " chars (" + DATE + ")");
  } catch (e) {
    console.error("marketIntel: " + e.message);
  }
})();
