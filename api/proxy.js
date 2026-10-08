// ============================================
// CreatorBoost API Proxy
// يحمي مفتاح Groq من الاستخراج
// ============================================

export default async function handler(req, res) {
  // CORS للسماح للإضافة بالاتصال
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const { systemPrompt, userPrompt, maxTokens = 4000 } = req.body;

    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ error: "Missing systemPrompt or userPrompt" });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("[Proxy] Groq error:", groqRes.status, errText);
      return res.status(groqRes.status).json({
        error: `Groq error ${groqRes.status}`,
        details: errText.slice(0, 300),
      });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: "No content from Groq" });
    }

    // نظّف الرد من markdown
    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // حاول تحول JSON
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e2) {
          return res.status(500).json({ error: "Failed to parse JSON from AI" });
        }
      } else {
        return res.status(500).json({ error: "Invalid JSON response from AI" });
      }
    }

    return res.status(200).json({ success: true, data: parsed });
  } catch (err) {
    console.error("[Proxy] Server error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
