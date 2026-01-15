export default async function handler(req, res) {
  // CORS (на всякий случай, чтобы с фронта не было проблем)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { language, code } = req.body || {};
    const lang = String(language || "").trim().toLowerCase();
    const src = String(code || "");

    if (!lang || !src.trim()) {
      return res.status(400).json({ error: "Missing language or code" });
    }

    // Безопасный лимит (чтобы не улетать в стоимость огромными вставками)
    if (src.length > 20000) {
      return res.status(413).json({ error: "Code is too large (max 20000 chars)" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set in Vercel env" });
    }

    // Самая дешевая нормальная модель для таких задач
    // (по документации есть gpt-5-mini, очень экономная) :contentReference[oaicite:1]{index=1}
    const model = "gpt-5-mini";

    const prompt = `
You are a strict code reviewer.
Language: ${lang}

Task:
1) Check the code for syntax errors, runtime issues, and obvious logic mistakes.
2) If you can confidently fix, provide a corrected version.
3) If you are not sure about a fix, explain and keep code minimal changes.

Output MUST be valid JSON (no markdown, no extra text) with this shape:
{
  "ok": boolean,
  "issues": [
    {
      "line": number|null,
      "type": "syntax"|"runtime"|"logic"|"style"|"security"|"other",
      "message": string,
      "suggestion": string
    }
  ],
  "fixed_code": string
}

Rules:
- If no issues: ok=true, issues=[], fixed_code=original code unchanged.
- Keep fixes minimal. Preserve formatting as much as possible.
- For HTML/CSS: validate tags/brackets, common mistakes.
- For JS: check missing semicolons not required; focus on real errors.
- For Python: indentation and syntax.
`;

    const body = {
      model,
      input: [
        { role: "system", content: "Return ONLY valid JSON. No markdown." },
        { role: "user", content: prompt + "\n\nCODE:\n" + src }
      ],
      // Чуть ограничим выход, чтобы дешевле было
      max_output_tokens: 1200
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "OpenAI request failed",
        details: data
      });
    }

    // Responses API: текст ответа может лежать в output_text
    const text = data.output_text || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // Если модель вдруг вернула лишнее — отдаём как есть, чтобы ты видел проблему
      return res.status(200).json({
        ok: false,
        issues: [{ line: null, type: "other", message: "Model output was not valid JSON", suggestion: "Try again" }],
        fixed_code: src,
        raw: text
      });
    }

    // Подстрахуемся
    if (typeof parsed.ok !== "boolean") parsed.ok = false;
    if (!Array.isArray(parsed.issues)) parsed.issues = [];
    if (typeof parsed.fixed_code !== "string") parsed.fixed_code = src;

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
