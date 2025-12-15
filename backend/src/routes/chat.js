import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { countTokens } from "../utils/tokenCounter.js";

const JWT_SECRET = process.env.JWT_SECRET || "repair-fix-hackathon-2025-secret";

// Middleware for authenticating JWT tokens
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// Internal nodes that should be excluded from event streaming
const INTERNAL_NODES = ["__start__", "__end__"];

export default function chatRoutes(repairGraph) {
  const router = express.Router();

  // Handle CORS preflight for /stream endpoint
  router.options("/stream", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.sendStatus(204);
  });

  // POST route for streaming chat events
  router.post("/stream", authenticate, async (req, res) => {
    const { message, thread_id } = req.body;
    const userThreadId = thread_id || `user_${req.userId}`;

    // Set up headers for SSE (Server-Sent Events)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.flushHeaders(); // Make sure headers are sent immediately

    try {
      // Stream events from the LangGraph
      for await (const event of repairGraph.streamEvents(
        { userQuery: message },
        { configurable: { thread_id: userThreadId }, version: "v1" }
      )) {
        // Filter internal nodes and handle streaming of valid events
        if (
          event.event === "on_chain_end" &&
          !event.name?.startsWith("ChannelWrite") &&
          !INTERNAL_NODES.includes(event.name)
        ) {
          res.write(`data: ${JSON.stringify({ type: "node", node: event.name })}\n\n`);
        }

        // Handle final answer (summarize node) and update token usage in database
        if (event.name === "summarize" && event.event === "on_chain_end") {
          const finalAnswer = event.data?.output?.finalAnswer;

          if (finalAnswer?.content) {
            const tokensUsed = countTokens(finalAnswer.content);

            // Update token usage for the user in the database
            await prisma.user.update({
              where: { id: req.userId },
              data: { tokensUsed: { increment: tokensUsed } },
            });

            // Send final answer to frontend
            res.write(
              `data: ${JSON.stringify({
                type: "final",
                content: finalAnswer.content,
                source: finalAnswer.source,
                tokensUsed,
              })}\n\n`
            );
          }
        }
      }

      // Signal the end of the stream
      res.write('data: { "type": "end" }\n\n');
      res.end();
    } catch (err) {
      // In case of error, send error message and end the stream
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  });

  return router;
}
