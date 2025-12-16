// src/tools/ifixit/selectGuide.js
export function selectBestGuide(guides, intent) {
  let best = null;
  let bestScore = 0;

  for (const guide of guides) {
    let score = 0;
    const title = guide.title.toLowerCase();

    if (intent.issue.component && title.includes(intent.issue.component)) {
      score += 50;
    }

    if (intent.issue.type === guide.type) {
      score += 30;
    }

    if (title.includes("replacement")) score += 10;
    if (guide.flags?.includes("GUIDE_STARRED")) score += 20;

    if (score > bestScore) {
      bestScore = score;
      best = guide;
    }
  }

  return best;
}
