import { tool } from "@langchain/core/tools";
import { fetchRepairGuide } from "./ifixit.js";

export const ifixitTool = tool(
  async ({ query }) => {
    const result = await fetchRepairGuide(query);
    return result;
  },
  {
    name: "ifixit_search",
    description:
      "Searches the official iFixit database for verified repair guides. Use this tool first before any web search.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "User repair question or device issue",
        },
      },
      required: ["query"],
    },
  }
);
