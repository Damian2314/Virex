export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const body = req.body || {};
    const tool = String(body.tool || "").toLowerCase();
    const tone = body.tone || "Neutral";
    const language = body.language || "Auto";

    const langRule = language === "Auto"
      ? "Write in the same language as the user's input."
      : `Write in ${language}.`;

    let prompt = "";

    if (tool === "humanize") {
      const inputText = String(body.inputText || "").trim();
      if (!inputText) return res.status(400).json({ error: "Empty inputText" });

      prompt = `You are a world-class editor.
Rewrite the text to sound natural, human-written, and fluent.

Rules:
- Keep the original meaning.
- Improve clarity and readability.
- Remove robotic phrasing and repetition.
- Use a ${tone} tone.
- ${langRule}
- Return only the rewritten text.

Text:
${inputText}`;
    } else if (tool === "coverletter") {
      const jobTitle = String(body.jobTitle || "").trim();
      const company = String(body.company || "").trim();
      const background = String(body.background || "").trim();
      const jobDesc = String(body.jobDesc || "").trim();

      if (!jobTitle || !background || !jobDesc) {
        return res.status(400).json({ error: "Missing jobTitle/background/jobDesc" });
      }

      prompt = `You are a hiring manager + copywriter.
Create a tailored cover letter.

Requirements:
- Use a ${tone} tone.
- ${langRule}
- 220–320 words.
- Make it specific to the job description.
- Highlight the candidate strengths.
- No placeholders like [Name]. Avoid clichés.
- End with a confident closing + call to action.

Job title: ${jobTitle}
Company: ${company || "N/A"}

Candidate strengths / experience:
${background}

Job description:
${jobDesc}

Return only the final cover letter text.`;
    } else if (tool === "social") {
      const topic = String(body.topic || "").trim();
      const platform = String(body.platform || "Telegram");
      const length = String(body.length || "Medium");
      if (!topic) return res.status(400).json({ error: "Missing topic" });

      const lenRule =
        length === "Short" ? "80–120 words" :
        length === "Long" ? "180–260 words" :
        "120–180 words";

      prompt = `You are a social media copywriter.
Write a ${platform} post about the topic below.

Rules:
- Style: ${tone}
- ${langRule}
- Length: ${lenRule}
- Structure: Hook → Value → CTA
- Add 3–8 relevant hashtags if platform supports it.
- Make it human.

Topic:
${topic}

Return only the final post.`;
    } else {
      return res.status(400).json({ error: "Unknown tool" });
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt
      })
    });

    if (!r.ok) {
      return res.status(500).json({ error: "OpenAI request failed", details: await r.text() });
    }

    const data = await r.json();
    const outputText =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output.flatMap(o => o.content || []).map(c => c.text).filter(Boolean).join("\n")
        : "");

    return res.status(200).json({ outputText: outputText || "" });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
