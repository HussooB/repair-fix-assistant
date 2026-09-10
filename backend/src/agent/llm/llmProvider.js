import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
dotenv.config();

// Primary & Only: OpenRouter (Using the official free router)
// This automatically picks an available free model, preventing 404s!
const openRouterLlm = new ChatOpenAI({
  model: "openrouter/free", 
  temperature: 0,
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/HussooB/repair-fix-assistant",
      "X-Title": "Repair Fix Assistant",
    },
  },
});

export async function generateStructuredJSON(prompt) {
  try {
    const response = await openRouterLlm.invoke(prompt);
    return cleanJsonString(response.content);
  } catch (error) {
    console.error("OpenRouter LLM generation failed:", error.message);
    throw new Error("LLM generation failed");
    }
}

export async function generateText(prompt) {
  try {
    const response = await openRouterLlm.invoke(prompt);
    return response.content;
  } catch (error) {
    console.error("OpenRouter LLM generation failed:", error.message);
    throw new Error("LLM generation failed");
  }
}

function cleanJsonString(str) {
  if (!str) return str;
  return str.replace(/```(?:json)?\n?|```/g, "").trim();
}