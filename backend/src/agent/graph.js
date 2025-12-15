import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";

import { fetchRepairGuide } from "./tools/ifixit.js";
import { webSearch } from "./tools/webSearch.js";
import { normalizeDeviceNode } from "./nodes/normalizeDevice.js";
import { summarizeNode } from "./nodes/summarize.js";

/* ---------------- GRAPH DEFINITION ---------------- */

const graph = new StateGraph(AgentState);

// Nodes
graph.addNode("normalize", async (state) => {
  return await normalizeDeviceNode(state);
});

graph.addNode("ifixit", async (state) => {
  const result = await fetchRepairGuide(state.userQuery);
  return { ...state, ifixitResult: result };
});

graph.addNode("web", async (state) => {
  const result = await webSearch(state.userQuery);
  return { ...state, webResult: result };
});

graph.addNode("summarize", async (state) => {
  return await summarizeNode(state);
});

// Edges
graph.setEntryPoint("normalize");
graph.addEdge("normalize", "ifixit");

graph.addConditionalEdges(
  "ifixit",
  (state) => (state.ifixitResult ? "summarize" : "web"),
  {
    summarize: "summarize",
    web: "web",
  }
);

graph.addEdge("web", "summarize");
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

  return graph.compile({
    checkpointer,
  });
}
