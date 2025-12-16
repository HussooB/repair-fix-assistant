import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";

import { extractIntentNode } from "./nodes/extractIntentNode.js";
import { fetchRepairGuideFromIntent } from "../agent/tools/fetchRepairGuideFromIntent.js";  // Fixed path
import { webSearch } from "./tools/webSearch.js";
import { summarizeNode } from "./nodes/summarize.js";

import { getCachedGuide, setCachedGuide, getCachedWeb, setCachedWeb } from "../db/cacheHelpers.js";

/* ---------------- GRAPH ---------------- */
const graph = new StateGraph(AgentState);

/* ---------------- NODES ---------------- */
graph.addNode("extractIntent", extractIntentNode);

// Clarifying Node for very low confidence (<0.4)
graph.addNode("clarifyingNode", async (state) => ({
  ...state,
  finalAnswer: "I'm not sure I understood your device/problem. Could you clarify?",
  source: "agent",
}));

// iFixit node with caching
graph.addNode("ifixit", async (state) => {
  const cacheKey = state.userQuery;  // Use userQuery for caching
  if (!cacheKey) return state;

  let result = await getCachedGuide(cacheKey);
  if (!result) {
    try {
      result = await fetchRepairGuideFromIntent(state.intent, 3);  // Pass intent object
      if (result) await setCachedGuide(cacheKey, result);
    } catch (err) {
      console.error("ifixit fetch failed:", err.message);
      result = null;
    }
  }

  return {
    ...state,
    ifixitResult: result,
    ifixitResultMarkdown: result?.guides?.length
      ? result.guides.map((g, gi) => `### Guide ${gi + 1}: ${g.title}`).join("\n\n")
      : "",
    source: "ifixit",
  };
});

// Web fallback node with caching
graph.addNode("web", async (state) => {
  const query = state.userQuery;
  if (!query) return state;

  let result = await getCachedWeb(query);
  if (!result) {
    result = await webSearch(query);
    if (result) await setCachedWeb(query, result);
  }

  return {
    ...state,
    webResult: result,
    source: "web",
  };
});

// Summarize / finalize
graph.addNode("summarize", summarizeNode);

/* ---------------- FLOW ---------------- */
graph.setEntryPoint("extractIntent");

// Confidence-based routing
graph.addConditionalEdges(
  "extractIntent",
  (state) => {
    if (!state.intent) return "web";
    if (state.intent.confidence < 0.4) return "clarifyingNode";
    return state.intent.confidence < 0.6 ? "web" : "ifixit";
  },
  {
    ifixit: "ifixit",
    web: "web",
    clarifyingNode: "clarifyingNode",
  }
);

// Fallback from ifixit to web if no result
graph.addConditionalEdges(
  "ifixit",
  (state) => state.ifixitResult ? "summarize" : "web",
  {
    summarize: "summarize",
    web: "web",
  }
);

// Normal flow
graph.addEdge("web", "summarize");
graph.addEdge("clarifyingNode", END);
graph.addEdge("summarize", END);

/* ---------------- INITIALIZER ---------------- */
export async function initializeGraph() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 60000,
    max: 10,
  });

  const checkpointer = new PostgresSaver(pool);
  await checkpointer.setup();

  return graph.compile({ checkpointer });
}