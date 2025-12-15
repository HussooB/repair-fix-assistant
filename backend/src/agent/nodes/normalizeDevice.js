import { generate } from "../llm/huggingface.js";

// List of common accessories to preserve
const ACCESSORY_KEYWORDS = [
  "headset", "mouse", "keyboard", "controller", "printer", "webcam", "monitor"
];

export async function normalizeDeviceNode(state) {
  try {
    const prompt = `
Extract the main device and any accessories mentioned from the sentence.
Return a COMMA-SEPARATED string: main device first, accessory second if present.

Sentence: "${state.userQuery}"
`;

    let normalized = (await generate(prompt))?.trim();

    // Fallback: always include accessory keywords manually
    const lowerQuery = state.userQuery.toLowerCase();
    const accessoriesFound = ACCESSORY_KEYWORDS.filter(k => lowerQuery.includes(k));

    if (accessoriesFound.length > 0) {
      // If LLM missed it, append manually
      if (!normalized.toLowerCase().includes(accessoriesFound[0])) {
        normalized += `, ${accessoriesFound[0]}`;
      }
    }

    return { ...state, userQuery: normalized || state.userQuery };
  } catch (err) {
    console.error("normalizeDeviceNode error:", err.message);
    return state;
  }
}
