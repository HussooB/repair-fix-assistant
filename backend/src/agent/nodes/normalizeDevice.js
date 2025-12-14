// src/agent/nodes/normalizeDevice.js
import { generate } from "../llm/huggingface.js";

export async function normalizeDeviceNode(state) {
  try {
    // Context management: Trim/summarize long chat history
    if (state.messages?.length > 10) {
      const summaryPrompt = `Summarize this chat history briefly (200 words max) to keep context: ${state.messages.map(m => m.content).join('\n')}`;
      const summary = await generate(summaryPrompt);
      state.messages = [{ role: "system", content: summary }, { role: "user", content: state.userQuery }];
    }

    const prompt = `
Extract the device name from the following sentence.
Return ONLY the official device name.
If unsure, return the original input.

Sentence: "${state.userQuery}"
`;
    const device = (await generate(prompt))?.trim() || state.userQuery;

    return { ...state, userQuery: device };
  } catch (err) {
    console.error("Normalize error:", err.message);
    return state;
  }
}