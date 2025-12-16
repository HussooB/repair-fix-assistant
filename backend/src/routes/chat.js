import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { countTokens } from "../utils/tokenCounter.js";

const JWT_SECRET = process.env.JWT_SECRET || "repair-fix-hackathon-2025-secret";

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ error: "No token provided" });

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
      Connection: "keep-alive",
    });
    res.flushHeaders();

    try {
      for await (const event of repairGraph.streamEvents(
        { userQuery: message },
        { configurable: { thread_id: userThreadId }, version: "v1" }
      )) {
        if (INTERNAL_NODES.includes(event.name)) continue;

        /* ---------------- iFixit NODE ---------------- */
        if (event.name === "ifixit" && event.event === "on_chain_end") {
          res.write(
            `data: ${JSON.stringify({
              type: "diagnostic",
              message: "🔍 Searching official iFixit repair guides...",
            })}\n\n`
          );

          const ifixitResult = event.data.output.ifixitResult;  // Use graph output

          if (ifixitResult?.guides?.length) {
            for (const [gi, guide] of ifixitResult.guides.entries()) {
              for (const [si, step] of guide.steps.entries()) {
                const stepMarkdown =
                  `### Guide ${gi + 1}: ${guide.title}\n` +
                  `**Step ${si + 1}:** ${step.text}\n` +
                  (step.images?.length
                    ? step.images.map((img) => `![img](${img})`).join("\n")
                    : "");

                for (const char of stepMarkdown) {
                  res.write(
                    `data: ${JSON.stringify({ type: "token", content: char })}\n\n`
                  );
                  await new Promise((r) => setTimeout(r, 5));
                }

                res.write(
                  `data: ${JSON.stringify({
                    type: "step_end",
                    guideIndex: gi,
                    stepIndex: si,
                  })}\n\n`
                );
              }
            }
          } else {
            res.write(
              `data: ${JSON.stringify({
                type: "diagnostic",
                message:
                  "🌐 No official iFixit guide found. Searching community solutions...",
              })}\n\n`
            );
          }
        }

        /* ---------------- WEB NODE ---------------- */
        if (event.name === "web" && event.event === "on_chain_end") {
          const webResult = event.data.output.webResult;  // Use graph output

          if (webResult?.answer) {
            const paragraphs = webResult.answer.split('\n').filter(p => p.trim());
            for (const paragraph of paragraphs) {
              for (const char of paragraph) {
                res.write(
                  `data: ${JSON.stringify({ type: "token", content: char })}\n\n`
                );
                await new Promise((r) => setTimeout(r, 5));
              }
              res.write(
                `data: ${JSON.stringify({ type: "step_end", guideIndex: -1 })}\n\n`
              );
            }

            // Stream sources
            if (webResult.sources?.length) {
              const sourcesMarkdown = webResult.sources.map(s => `- [${s.title}](${s.url}): ${s.snippet}`).join('\n');
              for (const char of sourcesMarkdown) {
                res.write(
                  `data: ${JSON.stringify({ type: "token", content: char })}\n\n`
                );
                await new Promise((r) => setTimeout(r, 5));
              }
            }
          }
        }

        /* ---------------- FINAL SUMMARY ---------------- */
        if (event.name === "summarize" && event.event === "on_chain_end") {
          const finalAnswer = event.data?.output?.finalAnswer;
          if (finalAnswer?.content) {
            const tokensUsed = countTokens(finalAnswer.content);

            await prisma.user.update({
              where: { id: req.userId },
              data: { tokensUsed: { increment: tokensUsed } },
            });

            for (const char of finalAnswer.content) {
              res.write(
                `data: ${JSON.stringify({ type: "token", content: char })}\n\n`
              );
              await new Promise((r) => setTimeout(r, 5));
            }

            res.write(
              `data: ${JSON.stringify({ type: "final", tokensUsed })}\n\n`
            );
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
      );
      res.end();
    }
  });

  return router;
}