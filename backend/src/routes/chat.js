import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { countTokens } from "../utils/tokenCounter.js";
import { fetchRepairGuideFromIntent } from "../agent/tools/fetchRepairGuideFromIntent.js";
import { webSearch } from "../agent/tools/webSearch.js";

const JWT_SECRET = process.env.JWT_SECRET || "repair-fix-hackathon-2025-secret";

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

const INTERNAL_NODES = ["__start__", "__end__"];

// Helpers
async function getCachedGuide(query) {
  let cached = await prisma.toolCache.findUnique({ where: { key: `ifixit:${query}` } });
  if (cached?.value) return cached.value;

  const result = await fetchRepairGuideFromIntent(query, 3);
  if (result) {
    await prisma.toolCache.upsert({
      where: { key: `ifixit:${query}` },
      update: { value: result },
      create: { key: `ifixit:${query}`, value: result },
    });
  }
  return result;
}

async function getCachedWeb(query) {
  let cached = await prisma.toolCache.findUnique({ where: { key: `web:${query}` } });
  if (cached?.value) return cached.value;

  const result = await webSearch(query);
  if (result) {
    await prisma.toolCache.upsert({
      where: { key: `web:${query}` },
      update: { value: result },
      create: { key: `web:${query}`, value: result },
    });
  }
  return result;
}

export default function chatRoutes(repairGraph) {
  const router = express.Router();

  router.options("/stream", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.sendStatus(204);
  });

  router.post("/stream", authenticate, async (req, res) => {
    const { message, thread_id } = req.body;
    const userThreadId = thread_id || `user_${req.userId}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.flushHeaders();

    try {
      for await (const event of repairGraph.streamEvents(
        { userQuery: message },
        { configurable: { thread_id: userThreadId }, version: "v1" }
      )) {
        if (INTERNAL_NODES.includes(event.name)) continue;

        // iFixit streaming
        if (event.name === "ifixit" && event.event === "on_chain_end") {
          const query = event.data?.input?.userQuery || message;
          const guides = await getCachedGuide(query);

          if (guides?.guides?.length) {
            for (const [gi, guide] of guides.guides.entries()) {
              await new Promise((r) => setTimeout(r, 100));
              for (const [si, step] of guide.steps.entries()) {
                const stepMarkdown =
                  `### Guide ${gi + 1}: ${guide.title}\n**Step ${si + 1}:** ${step.text}\n` +
                  (step.images?.length ? step.images.map((img) => `![img](${img})`).join("\n") : "");

                for (const char of stepMarkdown) {
                  res.write(`data: ${JSON.stringify({ type: "token", content: char })}\n\n`);
                  await new Promise((r) => setTimeout(r, 5));
                }
                res.write(`data: ${JSON.stringify({ type: "step_end", guideIndex: gi, stepIndex: si })}\n\n`);
              }
            }
          } else {
            // Fallback to web search if no iFixit guides
            const webResult = await getCachedWeb(query);
            if (webResult?.length) {
              for (const paragraph of webResult) {
                for (const char of paragraph) {
                  res.write(`data: ${JSON.stringify({ type: "token", content: char })}\n\n`);
                  await new Promise((r) => setTimeout(r, 5));
                }
                res.write(`data: ${JSON.stringify({ type: "step_end", guideIndex: -1 })}\n\n`);
              }
            }
          }
        }

        // Summarize node
        if (event.name === "summarize" && event.event === "on_chain_end") {
          const finalAnswer = event.data?.output?.finalAnswer;
          if (finalAnswer?.content) {
            const tokensUsed = countTokens(finalAnswer.content);
            await prisma.user.update({
              where: { id: req.userId },
              data: { tokensUsed: { increment: tokensUsed } },
            });

            for (const char of finalAnswer.content) {
              res.write(`data: ${JSON.stringify({ type: "token", content: char })}\n\n`);
              await new Promise((r) => setTimeout(r, 5));
            }
            res.write(`data: ${JSON.stringify({ type: "final", tokensUsed })}\n\n`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  });

  return router;
}
