import { generate } from "../llm/huggingface.js";

export async function summarizeNode(state) {
  let content = "";
  let source = "unknown";
  let promptIntro = "";

  if (state.ifixitResult) {
    content = JSON.stringify(state.ifixitResult, null, 2);
    source = "ifixit";
    promptIntro =
      "This is an OFFICIAL iFixit repair guide. Format it in clean Markdown.";
  } else if (state.webResult) {
    content = JSON.stringify(state.webResult, null, 2);
    source = "web";
    promptIntro =
      "This is web search data. Summarize into safe general repair advice.";
  } else {
    return {
      ...state,
      finalAnswer: {
        source: "none",
        content: "No repair information was found.",
      },
    };
  }

  const prompt = `${promptIntro}\n\n${content}`;
  const formattedContent = await generate(prompt);

  return {
    ...state,
    finalAnswer: {
      source,
      content: formattedContent,
    },
  };
}
