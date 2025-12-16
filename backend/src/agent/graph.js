import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState } from "./state.js";

import { extractIntentNode } from "./nodes/extractIntentNode.js";
import { fetchRepairGuideFromIntent } from "../agent/tools/fetchRepairGuideFromIntent.js";
import { webSearch } from "./tools/webSearch.js";
import { summarizeNode } from "./nodes/summarize.js";

import { prisma } from "../db/prisma.js";

/* ---------------- POSTGRESQL CACHE ---------------- */
async function getCache(key) {
  const record = await prisma.toolCache.findUnique({ where: { key } });
  return record?.value || null;
}

async function setCache(key, value) {
  await prisma.toolCache.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

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

// iFixit node with PostgreSQL caching, multi-guide, Markdown-ready
graph.addNode("ifixit", async (state) => {
  const query = state.intent?.text || state.userQuery;
  if (!query) return state;

  // Check Postgres cache
  let result = await getCache(`ifixit:${query}`);
  if (!result) {
    result = await fetchRepairGuideFromIntent(query, 3); // top 3 guides
    await setCache(`ifixit:${query}`, result);
  }

  // Prepare Markdown for all guides
  let markdown = "";
  if (result?.guides?.length) {
    markdown = result.guides
      .map(
        (g, gi) =>
          `### Guide ${gi + 1}: ${g.title}\n\n` +
          g.steps
            .map(
              (s, si) =>
                `**Step ${si + 1}:** ${s.text}\n` +
                (s.images?.length ? s.images.map((img) => `![img](${img})`).join("\n") : "")
            )
            .join("\n\n")
      )
      .join("\n\n---\n\n");
  }

  return {
    ...state,
    ifixitResult: result,
    ifixitResultMarkdown: markdown,
    source: "ifixit",
  };
});

// Web fallback node with PostgreSQL caching
graph.addNode("web", async (state) => {
  const query = state.userQuery;
  if (!query) return state;

  let result = await getCache(`web:${query}`);
  if (!result) {
    result = await webSearch(query);
    await setCache(`web:${query}`, result);
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

// Normal flow
graph.addEdge("ifixit", "summarize");
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
