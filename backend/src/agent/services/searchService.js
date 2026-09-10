import axios from "axios";

export class SearchService {
  constructor() {
    // Use a reliable public SearXNG instance or custom env
    this.searxngUrl = process.env.SEARXNG_URL || "https://searx.be";
    this.tavilyApiKey = process.env.TAVILY_API_KEY;
  }

  async search(query, maxResults = 5) {
    try {
      // Try SearXNG first (free, no API key required)
      const response = await axios.get(`${this.searxngUrl}/search`, {
        params: { 
          q: `${query} repair guide step by step`, 
          format: "json",
          max_results: maxResults 
        },
        timeout: 5000,
      });
      
      const results = response.data?.results || [];
      return {
        answer: results[0]?.content || null,
        sources: results.slice(0, maxResults).map((r) => ({
          title: r.title || "Untitled Source",
          url: r.url || "",
          snippet: r.content?.slice(0, 300) || "",
        })),
      };
    } catch (error) {
      console.warn("SearXNG failed, falling back to Tavily:", error.message);
      return this._tavilySearch(query, maxResults);
    }
  }

  async _tavilySearch(query, maxResults) {
    if (!this.tavilyApiKey) {
      console.warn("No Tavily API key provided and SearXNG failed. Returning empty result.");
      return { answer: "No web results found.", sources: [] };
    }

    try {
      const res = await axios.post("https://api.tavily.com/search", {
        api_key: this.tavilyApiKey,
        query: `${query} repair guide`,
        search_depth: "basic",
        max_results: maxResults,
        include_answer: true,
      });

      return {
        answer: res.data?.answer || null,
        sources: (res.data?.results || []).map((r) => ({
          title: r.title || "Untitled Source", 
          url: r.url || "", 
          snippet: r.content?.slice(0, 300) || ""
        })),
      };
    } catch (err) {
      console.error("Tavily search failed:", err.message);
      return { answer: "No web results found.", sources: [] };
    }
  }
}