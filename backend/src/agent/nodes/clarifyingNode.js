import { generateText } from "../llm/llmProvider.js";

export async function clarifyingNode(state) {
  const prompt = `
You are a professional, warm, and highly helpful AI repair assistant. 
The user's query was either a general greeting (like "hello", "hi") or too vague to identify a specific device or problem.

User query: "${state.userQuery}"

Your goal:
1. If it's a greeting, warmly welcome them and state that you are here to help them with step-by-step repair guides for their tools or devices.
2. If it's vague, politely ask them to provide the device brand, model, and a brief description of the issue so you can find the best official guide for them.

Keep your response friendly, professional, and concise (2-3 sentences max).
`;

  try {
    const content = await generateText(prompt);
    return {
      ...state,
      finalAnswer: {
        source: "agent",
        content: content,
      },
    };
  } catch (err) {
    console.error("clarifyingNode LLM failed:", err.message);
    return {
      ...state,
      finalAnswer: {
        source: "agent",
        content: "Hello! I'm here to help you fix your device. Could you please tell me the brand, model, and what seems to be the problem?",
      },
    };
  }
}