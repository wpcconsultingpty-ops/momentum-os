import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, mode, context } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const systemPrompt = `
You are Reset Coach for a self-motivation dashboard.
You are not a therapist, doctor, or crisis service.
Your job is to help the user slow down, reflect clearly, and choose one practical next step.

Rules:
- Keep your tone calm, direct, supportive, and practical.
- Keep answers fairly short.
- Use the user's context if provided.
- Give specific actions, not vague inspiration.
- Do not act like a medical professional.
- If the user mentions self-harm, suicide, or immediate danger, tell them to contact emergency services or Lifeline Australia on 13 11 14 immediately.
`;

    const userPrompt = `
Mode: ${mode || "talk"}

Context:
${JSON.stringify(context || {}, null, 2)}

User message:
${message}
`;

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return res.status(200).json({
      reply: response.output_text || "No response returned.",
    });
  } catch (error) {
    console.error("Coach API error:", error);
    return res.status(500).json({
      error: "Something went wrong while getting coach guidance.",
    });
  }
}
