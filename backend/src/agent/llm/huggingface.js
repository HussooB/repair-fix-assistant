// src/agent/llm/huggingface.js (or wherever your hf client is)

import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";
dotenv.config();

export const hf = new HfInference(process.env.HUGGINGFACE_API_KEY); // no need for provider option

export async function generate(prompt) {
  const res = await hf.chatCompletion({
    model: "meta-llama/Llama-3.1-8B-Instruct",  // Excellent, free, fast on providers
    // or "google/gemma-2-9b-it" 
    // or "Qwen/Qwen2.5-7B-Instruct"
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 1024,
  });
  return res.choices[0].message.content;
}