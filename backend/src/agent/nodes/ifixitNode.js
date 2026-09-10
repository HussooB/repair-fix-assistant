import { getCachedGuide, setCachedGuide } from "../../db/cacheHelpers.js";
import { fetchRepairGuideFromIntent } from "../tools/fetchRepairGuideFromIntent.js";

export async function ifixitNode(state) {
  const cacheKey = state.userQuery;
  if (!cacheKey) return state;

  let result = await getCachedGuide(cacheKey);
  
  if (!result) {
    try {
      result = await fetchRepairGuideFromIntent(state.intent, 3);
      if (result) await setCachedGuide(cacheKey, result);
    } catch (err) {
      console.error("ifixit fetch failed:", err.message);
      result = null;
    }
  }

  return {
    ...state,
    ifixitResult: result,
    ifixitResultMarkdown: result?.guides?.length
      ? result.guides.map((g, gi) => `### Guide ${gi + 1}: ${g.title}`).join("\n\n")
      : "",
    source: "ifixit",
  };
}