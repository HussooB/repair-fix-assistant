// src/routes/chat.js

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

    const writeToken = async (content) => {
      res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
      // Small delay for natural typing feel (~30-50ms per char = realistic)
      await new Promise((r) => setTimeout(r, 30));
    };

    const writeDiagnostic = (msg) => {
      res.write(
        `data: ${JSON.stringify({ type: "diagnostic", message: msg })}\n\n`
      );
    };

    try {
      for await (const event of repairGraph.streamEvents(
        { userQuery: message },
        { configurable: { thread_id: userThreadId }, version: "v1" }
      )) {
        if (INTERNAL_NODES.includes(event.name)) continue;

        /* ---------------- iFixit NODE ---------------- */
        if (event.name === "ifixit" && event.event === "on_chain_end") {
          writeDiagnostic("🔍 Searching official iFixit repair guides...");

          const ifixitResult = event.data.output.ifixitResult;

          if (ifixitResult?.guides?.length) {
            for (const guide of ifixitResult.guides) {
              for (const step of guide.steps) {
                const stepMarkdown =
                  `### ${guide.title}\n` +
                  `**Step:** ${step.text}\n` +
                  (step.images?.length
                    ? step.images.map((img) => `![Guide image](${img})`).join("\n")
                    : "") +
                  "\n\n";

                for (const char of stepMarkdown) {
                  await writeToken(char);
                }
              }
            }
          } else {
            writeDiagnostic("🌐 No official iFixit guide found. Searching community solutions...");
          }
        }

        /* ---------------- WEB NODE ---------------- */
        if (event.name === "web" && event.event === "on_chain_end") {
          const webResult = event.data.output.webResult;

          if (webResult?.answer) {
            // Stream the answer
            for (const char of webResult.answer + "\n\n") {
              await writeToken(char);
            }

            // Stream sources
            if (webResult.sources?.length) {
              const sourcesText = webResult.sources
                .map((s) => `- [${s.title}](${s.url})`)
                .join("\n") + "\n\n";

              for (const char of sourcesText) {
                await writeToken(char);
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

            // Stream the final LLM response character by character
            for (const char of finalAnswer.content) {
              await writeToken(char);
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
      console.error("Stream error:", err);
      res.write(
        `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
      );
      res.end();
    }
  });

  return router;
}