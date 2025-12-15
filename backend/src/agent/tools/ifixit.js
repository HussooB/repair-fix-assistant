import axios from "axios";

const IFIXIT_BASE_URL = "https://www.ifixit.com/api/2.0";

/* ---------------- HELPERS ---------------- */

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

/* ---------------- API CALLS ---------------- */

async function searchDevice(query) {
  const url = `${IFIXIT_BASE_URL}/search/${encodeURIComponent(query)}?filter=device`;
  try {
    const res = await axios.get(url);
    const results = res.data?.results || [];
    console.log("Search results:", results.map(r => r.title));

    if (results.length === 0) return null;

    // Normalize query for better matching
    const lowerQuery = query.toLowerCase().trim();

    let best = results[0];
    let bestScore = 0;

    for (const result of results) {
  const title = result.title.toLowerCase();
  let score = 0;

  // Exact match
  if (title === lowerQuery) score += 100;

  // Keyword matching
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  for (const word of queryWords) {
    if (title.includes(word)) score += 10;
  }

  // Prefer real device families
  if (/^(iphone|ipad|macbook|playstation|galaxy|nintendo|xbox|pixel|surface)/i.test(title)) {
    score += 10;
  }

  // 🚫 Penalize accessories
  if (
    title.includes("controller") &&
    !lowerQuery.includes("controller")
  ) {
    score -= 50;
  }

  if (
    title.includes("remote") ||
    title.includes("camera") ||
    title.includes("wheel") ||
    title.includes("case")
  ) {
    score -= 30;
  }

  // 🔥 Boost console for thermal issues
  if (
    (lowerQuery.includes("fan") ||
     lowerQuery.includes("overheat") ||
     lowerQuery.includes("heating")) &&
    title === "playstation 3"
  ) {
    score += 80;
  }

  // 🎮 Strong preference for main console names
  if (title === "playstation 3") {
    score += 40;
  }

  if (score > bestScore) {
    bestScore = score;
    best = result;
  }
}


    console.log("Selected device title:", best.title, `(score: ${bestScore})`);
    return best.title;
  } catch (err) {
    console.error("Device search error:", err.message);
    return null;
  }
}

async function listGuides(deviceTitle) {
  const url = `${IFIXIT_BASE_URL}/wikis/CATEGORY/${encodeURIComponent(deviceTitle)}`;
  try {
    const res = await axios.get(url);
    const guides = res.data?.guides || [];
    console.log(`Guides found for ${deviceTitle}: ${guides.length}`);
    if (guides.length > 0) {
      console.log("First few titles:", guides.slice(0, 5).map(g => g.title));
    }
    if (guides.length === 0) return null;
    return guides;
  } catch (error) {
    console.error("listGuides HTTP error:", error.response?.status, error.message);
    return null;
  }
}

async function getGuideDetails(guideId) {
  const url = `${IFIXIT_BASE_URL}/guides/${guideId}`;
  const res = await axios.get(url);

  const guide = res.data;
  if (!guide || !Array.isArray(guide.steps)) return null;

  const cleanedSteps = guide.steps.map((step, index) => {
    let images = [];

    // 🛡️ Normalize media safely
    if (Array.isArray(step.media)) {
      images = step.media
        .map(m => m?.url)
        .filter(Boolean);
    } else if (step.media?.url) {
      images = [step.media.url];
    }

    return {
      step: index + 1,
      text: stripHtml(step.text),
      images,
    };
  });

  return {
    title: guide.title,
    steps: cleanedSteps,
  };
}
/* ---------------- MAIN TOOL ---------------- */

export async function fetchRepairGuide(userQuery) {
  try {
    const deviceTitle = await searchDevice(userQuery);
    if (!deviceTitle) return null;

    const guides = await listGuides(deviceTitle);
    if (!guides) return null;

    const selectedGuide = guides[0];
    if (!selectedGuide?.guideid) return null;

    return await getGuideDetails(selectedGuide.guideid);
  } catch (error) {
    console.error("iFixit tool error:", error.message);
    return null;
  }
}

/* ---------------- LOCAL TEST ---------------- */

if (process.argv[1].includes("ifixit.js")) {
  const result = await fetchRepairGuide("PlayStation 5");
  console.log(JSON.stringify(result, null, 2));
}
