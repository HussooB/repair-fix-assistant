// src/agent/nodes/extractIntentNode.js
import { generate } from "../llm/huggingface.js";

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
    const intent = JSON.parse(raw);

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
