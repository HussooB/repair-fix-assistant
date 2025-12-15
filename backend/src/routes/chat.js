import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { countTokens } from "../utils/tokenCounter.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "repair-fix-hackathon-2025-secret";

// Auth middleware
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

export default function chatRoutes(repairGraph) {
  const router = express.Router();

  router.post("/stream", authenticate, async (req, res) => {
    const { message, thread_id } = req.body;
    const userThreadId = thread_id || `user_${req.userId}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const event of repairGraph.streamEvents(
        { userQuery: message },
        {
          configurable: { thread_id: userThreadId },
          version: "v1", // REQUIRED in langgraph v1.x
        }
      )) {
        // Node finished
        if (event.event === "on_chain_end") {
          res.write(
            `data: ${JSON.stringify({
              type: "node",
              node: event.name,
            })}\n\n`
          );
        }

        // Final output
        if (
          event.name === "summarize" &&
          event.event === "on_chain_end"
        ) {
          const finalAnswer = event.data?.output?.finalAnswer;

          if (finalAnswer?.content) {
            const tokensUsed = countTokens(finalAnswer.content);

            await prisma.user.update({
              where: { id: req.userId },
              data: { tokensUsed: { increment: tokensUsed } },
            });

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

      res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: err.message,
        })}\n\n`
      );
      res.end();
    }
  });

  return router;
}
