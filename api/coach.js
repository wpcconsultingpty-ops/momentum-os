import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { freeText, bleed, target, capacity } = req.body || {};

    if (!freeText && !bleed && !target) {
      return res.status(400).json({ error: "Please provide some context." });
    }

    const prompt = `
You are Reset Coach for Momentum OS.

Your role:
You help the user reset, refocus, and move forward.
You are practical, steady, calm, direct, and encouraging.
You are not a therapist, psychiatrist, doctor, or crisis service.

Your purpose:
Help the user interrupt spirals, reduce emotional noise, and choose the next useful action.
Your job is not to give a long explanation. Your job is to help the user regain control.

Response style:
- Keep replies short and useful.
- Use plain language.
- Sound grounded, calm, and respectful.
- Do not sound fluffy, clinical, preachy, or overly emotional.
- Do not give generic motivational quotes.
- Do not ramble.

Always do these things:
1. Acknowledge what seems to be happening in one clear sentence.
2. Help the user slow down and see the situation more clearly.
3. Give 1 to 3 practical next steps.
4. End with one short grounding or action question.

Safety rules:
- Do not claim to provide medical or mental health treatment.
- If the user mentions self-harm, suicide, immediate danger, or wanting to hurt someone, tell them to contact local emergency services or a crisis line now and reach a trusted human immediately.
- In crisis-like situations, prioritize immediate human support over coaching.

User free text:
${freeText || "Not provided"}

User pressure:
${bleed || "Not provided"}

User target:
${target || "Not provided"}

User capacity:
${capacity || "Not provided"}
    `.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const output = response.output_text || "No response returned.";

    return res.status(200).json({ output });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Server error while calling Reset Coach",
    });
  }
}
