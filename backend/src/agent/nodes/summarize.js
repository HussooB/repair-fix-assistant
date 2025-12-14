// src/agent/nodes/summarize.js
import { generate } from "../llm/huggingface.js";

export async function summarizeNode(state) {
  let content = "";
  let sourcePrompt = "";
  if (state.ifixitResult) {
    content = JSON.stringify(state.ifixitResult, null, 2);
    sourcePrompt = "This is an OFFICIAL iFixit repair guide. Format it beautifully in Markdown: include the title as #, introduction if present, then ## Steps with numbered list. For each step, write **Step X:** followed by the text. Mention '(Images available)' at the end of steps with images. Do NOT add, remove, or change any instructions.";
  } else if (state.webResult) {
    content = JSON.stringify(state.webResult, null, 2);
    sourcePrompt = "This is from web search fallback. Summarize into safe, general repair advice in clean Markdown. Do not invent specific steps.";
  } else {
    return state;
  }

  const prompt = `${sourcePrompt}\n\nContent:\n${content}`;
  const formattedContent = await generate(prompt);

  return {
    ...state,
    finalAnswer: {
      source: state.ifixitResult ? "ifixit" : "web",
      content: formattedContent,
    },
  };
}