import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";

import { fetchRepairGuide } from "./tools/ifixit.js";
import { webSearch } from "./tools/webSearch.js";

import { normalizeDeviceNode } from "./nodes/normalizeDevice.js";
import { summarizeNode } from "./nodes/summarize.js";

/* ---------------- NODES ---------------- */

// 1️⃣ Normalize device name (Gemini)
async function normalizeNode(state) {
  return await normalizeDeviceNode(state);
}

// 2️⃣ iFixit node (official source)
async function ifixitNode(state) {
  const result = await fetchRepairGuide(state.userQuery);

  return {
    ...state,
    ifixitResult: result,
    source: result ? "ifixit" : null,
  };
}

// 3️⃣ Web fallback node
async function webSearchNode(state) {
  const result = await webSearch(state.userQuery);

  return {
    ...state,
    webResult: result,
    source: result ? "web" : "none",
  };
}

// 4️⃣ Summarize / format (Gemini)
async function summarizeFinalNode(state) {
  return await summarizeNode(state);
}

/* ---------------- GRAPH ---------------- */

const graph = new StateGraph(AgentState);

// Register nodes
graph.addNode("normalize", normalizeNode);
graph.addNode("ifixit", ifixitNode);
graph.addNode("web", webSearchNode);
graph.addNode("summarize", summarizeFinalNode);

// Entry point
graph.setEntryPoint("normalize");

// normalize → iFixit
graph.addEdge("normalize", "ifixit");

// If iFixit succeeds → summarize
// Else → web search
graph.addConditionalEdges(
  "ifixit",
  (state) => (state.ifixitResult ? "summarize" : "web"),
  {
    summarize: "summarize",
    web: "web",
  }
);

// web → summarize
graph.addEdge("web", "summarize");

// summarize → END
graph.addEdge("summarize", END);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 60000, // 60 seconds
  idleTimeoutMillis: 60000,
  max: 10,
});

// Retry logic for setup
async function setupWithRetry() {
  let attempts = 0;
  while (attempts < 5) {
    try {
      const checkpointer = new PostgresSaver(pool);
      await checkpointer.setup(); // Creates tables
      return checkpointer;
    } catch (err) {
      attempts++;
      console.error(`Setup attempt ${attempts} failed:`, err.message);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }
  }
  throw new Error('Failed to setup checkpointer after 5 retries');
}

const checkpointer = await setupWithRetry();

export const repairGraph = graph.compile({
  checkpointer,
  streamMode: "updates"
});