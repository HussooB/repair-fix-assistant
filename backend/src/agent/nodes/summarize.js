// src/agent/nodes/summarize.js
import { generate } from "../llm/huggingface.js";

export async function summarizeNode(state) {
  const messages = state.messages ?? [];

  let toolContent = "";
  let source = "unknown";
  let instruction = "";

  if (state.ifixitResult) {
    toolContent = JSON.stringify(state.ifixitResult, null, 2);
    source = "ifixit";
    instruction = `
You are a repair assistant.
You MUST strictly follow the official iFixit guide.
Format the answer in clean Markdown:
- Use # for title
- Use ## Steps
- Number each step
- Mention "(Images available)" if images exist
Do NOT invent steps.
`;
  } else if (state.webResult) {
    const webData = state.webResult;
    toolContent = webData.answer + '\n\nSources:\n' + webData.sources.map(s => `- ${s.title}: ${s.snippet}`).join('\n');
    source = "web";
    instruction = `
You are a repair assistant.
This information comes from community web sources.
Summarize safely.
Do NOT invent precise disassembly steps.
Use general repair advice only.
`;
  } else {
    return {
      ...state,
      finalAnswer: {
        source: "none",
        content: "No repair information was found.",
      },
    };
  }

  const conversationContext = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const prompt = `
${instruction}

Conversation so far:
${conversationContext}

Tool data:
${toolContent}

Produce the best possible answer for the user's latest question.
`;

  const content = await generate(prompt);

  return {
    ...state,
    finalAnswer: {
      source,
      content,
    },
  };
}