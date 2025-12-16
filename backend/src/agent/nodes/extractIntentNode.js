// src/agent/nodes/extractIntentNode.js
import { generate } from "../llm/huggingface.js";

/**
 * Strip triple backticks or markdown code fences from LLM output
 */
function cleanJsonString(str) {
  if (!str) return str;
  return str.replace(/```(?:json)?\n?|```/g, "").trim();
}

export async function extractIntentNode(state) {
  const prompt = `
You extract structured repair intent for querying iFixit.

Return ONLY valid JSON matching this schema:

{
  "device": {
    "brand": string | null,
    "family": string | null,
    "model": string | null,
    "accessory": string | null,
    "category": string | null
  },
  "issue": {
    "type": "repair" | "replacement" | "troubleshooting" | "teardown",
    "component": string | null,
    "symptom": string | null
  },
  "confidence": number
}

User query:
"${state.userQuery}"
`;

  try {
    const raw = await generate(prompt);
    const cleaned = cleanJsonString(raw);
    const intent = JSON.parse(cleaned);

    return {
      ...state,
      intent,
    };
  } catch (err) {
    console.error("extractIntentNode failed:", err.message);
    return {
      ...state,
      intent: {
        rawQuery: state.userQuery,
        confidence: 0.2,
      },
    };
  }
}
