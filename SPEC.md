# content/<date>.json shape (technical)

`render.js` consumes `content/<YYYY-MM-DD>.json`. Exactly 7 slides. Keep `h` short (renders very large); keep `sub` to ~2 short lines so nothing overflows. Use `<mark>word</mark>` to highlight one phrase per headline.

```json
{
  "caption": "Instagram caption text + 5-7 hashtags",
  "brand": { "kicker": "Pink Media", "handle": "@bankhaltershay", "sub": "פינק מדיה · שיווק דיגיטלי" },
  "slides": [
    { "type": "hook",    "kicker": "...", "eyebrow": "...", "h": "headline with <mark>highlight</mark>", "sub": "1-2 short lines" },
    { "type": "content", "kicker": "...", "eyebrow": "...", "h": "... <mark>...</mark>", "sub": "..." },
    { "type": "content", "...": "..." },
    { "type": "content", "...": "..." },
    { "type": "content", "...": "..." },
    { "type": "content", "kicker": "...", "eyebrow": "...", "h": "...", "sub": "..." },
    { "type": "cta",     "kicker": "Pink Media", "eyebrow": "...", "h": "...", "sub": "...", "pill": "short button text" }
  ]
}
```

The editorial spec (persona, writing rules, structure, format rotation) is supplied to the generator at run time.
