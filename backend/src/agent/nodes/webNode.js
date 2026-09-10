import { SearchService } from '../services/searchService.js';
import { ContentScraperService } from '../services/contentScraperService.js';
import { getCachedWeb, setCachedWeb } from "../../db/cacheHelpers.js";

const searchService = new SearchService();
const scraperService = new ContentScraperService();

export async function webNode(state) {
  const query = state.userQuery;
  if (!query) return state;

  let searchResult = await getCachedWeb(query);
  
  if (!searchResult) {
    searchResult = await searchService.search(query, 5);
    if (searchResult) await setCachedWeb(query, searchResult);
  }

  // Scrape top 2 URLs for richer content
  const scrapedContent = await scraperService.scrapeTopUrls(
    searchResult?.sources || [], 
    2
  );

  return {
    ...state,
    webResult: {
      ...searchResult,
      scrapedContent,
    },
    source: "web",
  };
}