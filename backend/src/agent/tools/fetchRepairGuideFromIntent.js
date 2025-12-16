import axios from "axios";
import { resolveDevice } from "./deviceResolver.js";
import { selectBestGuide } from "./selectGuide.js";

const BASE = "https://www.ifixit.com/api/2.0";

/**
 * Convert a single guide into Markdown with images
 */
function guideToMarkdown(guide) {
  if (!guide?.steps?.length) return "";
  return guide.steps
    .map(
      (step, idx) =>
        `**Step ${idx + 1}:** ${step.text}\n` +
        (step.images?.length
          ? step.images.map((img) => `![Step ${idx + 1}](${img})`).join("\n")
          : "")
    )
    .join("\n\n");
}

/**
 * Fetch multiple guides and return cleaned Markdown
 */
export async function fetchRepairGuideFromIntent(intent, maxGuides = 3) {
  // Step 1: Resolve device
  const deviceTitle = await resolveDevice(intent);
  if (!deviceTitle) return null;

  // Step 2: List all guides
  const wikiRes = await axios.get(
    `${BASE}/wikis/CATEGORY/${encodeURIComponent(deviceTitle)}`
  );
  const guides = wikiRes.data?.guides || [];
  if (!guides.length) return null;

  // Step 3: Pick top N guides
  const topGuides = guides
    .map((g) => ({ ...g, score: selectBestGuide([g], intent)?.score || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxGuides);

  // Step 4: Fetch each guide details
  const fetchedGuides = [];
  for (const guide of topGuides) {
    if (!guide.guideid) continue;
    try {
      const guideRes = await axios.get(`${BASE}/guides/${guide.guideid}`);
      const rawGuide = guideRes.data;

      if (!rawGuide || !Array.isArray(rawGuide.steps)) continue;

      // Clean steps
      const cleanedSteps = rawGuide.steps.map((step) => {
        let images = [];
        if (Array.isArray(step.media)) {
          images = step.media.map((m) => m?.url).filter(Boolean);
        } else if (step.media?.url) {
          images = [step.media.url];
        }

        return { text: step.text.replace(/<[^>]*>/g, "").trim(), images };
      });

      fetchedGuides.push({
        title: rawGuide.title,
        markdown: guideToMarkdown({ steps: cleanedSteps }),
        steps: cleanedSteps,
      });
    } catch (err) {
      console.error(`Failed fetching guide ${guide.guideid}:`, err.message);
    }
  }

  // Step 5: Return structured object for streaming
  if (!fetchedGuides.length) return null;
  return {
    device: deviceTitle,
    guides: fetchedGuides,
    source: "ifixit",
  };
}
