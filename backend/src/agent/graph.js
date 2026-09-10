import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";

import { extractIntentNode } from "./nodes/extractIntentNode.js";
import { ifixitNode } from "./nodes/ifixitNode.js";
import { webNode } from "./nodes/webNode.js";
import { clarifyingNode } from "./nodes/clarifyingNode.js";
import { summarizeNode } from "./nodes/summarize.js";

const CONFIDENCE_THRESHOLDS = {
  CLARIFY: parseFloat(process.env.CONFIDENCE_THRESHOLD_CLARIFY) || 0.4,
  WEB_FALLBACK: parseFloat(process.env.CONFIDENCE_THRESHOLD_WEB) || 0.6,
};

const graph = new StateGraph(AgentState);

// Register nodes
graph.addNode("extractIntent", extractIntentNode);
graph.addNode("clarifyingNode", clarifyingNode);
graph.addNode("ifixit", ifixitNode);
graph.addNode("web", webNode);
graph.addNode("summarize", summarizeNode);

// Entry point
graph.setEntryPoint("extractIntent");

// Confidence-based routing
graph.addConditionalEdges(
  "extractIntent",
  (state) => {
    if (!state.intent) return "web";
    if (state.intent.confidence < CONFIDENCE_THRESHOLDS.CLARIFY) return "clarifyingNode";
    if (state.intent.confidence < CONFIDENCE_THRESHOLDS.WEB_FALLBACK) return "web";
    return "ifixit";
  },
  {
    ifixit: "ifixit",
    web: "web",
    clarifyingNode: "clarifyingNode",
  }
);

// Fallback from ifixit to web
graph.addConditionalEdges(
  "ifixit",
  (state) => state.ifixitResult ? "summarize" : "web",
  {
    summarize: "summarize",
    web: "web",
  }
);

// Normal flows
graph.addEdge("web", "summarize");
graph.addEdge("clarifyingNode", END);
graph.addEdge("summarize", END);

export async function initializeGraph() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000, 
    idleTimeoutMillis: 30000,
    max: 5,
    keepAlive: true, // Prevents "Connection terminated unexpectedly" errors
  });

  const checkpointer = new PostgresSaver(pool);
  
  try {
    console.log("Connecting to Supabase to initialize LangGraph...");
    await checkpointer.setup();
    console.log("✅ Database connected & LangGraph ready");
    return graph.compile({ checkpointer });
  } catch (err) {
    console.error("⚠️ Database connection failed:", err.message);
    console.log("⚠️ Starting server WITHOUT LangGraph checkpointing (DB is unreachable).");
    return graph.compile(); 
  }
}