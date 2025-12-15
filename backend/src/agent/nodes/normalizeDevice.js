import { generate } from "../llm/huggingface.js";

export async function normalizeDeviceNode(state) {
  try {
    const prompt = `
Extract the device name from the sentence.
Return ONLY the official device name.

Sentence: "${state.userQuery}"
`;

    const device = (await generate(prompt))?.trim();
    return { ...state, userQuery: device || state.userQuery };
  } catch {
    return state;
  }
}
