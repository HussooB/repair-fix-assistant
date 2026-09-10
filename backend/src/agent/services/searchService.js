import axios from "axios";

export class SearchService {
  constructor() {
    // Jina Search is free, requires no API key, and returns clean markdown
    this.jinaSearchUrl = "https://s.jina.ai";
    this.tavilyApiKey = process.env.TAVILY_API_KEY;
  }

  async search(query, maxResults = 5) {
    try {
      const searchQuery = `${query} repair guide step by step`;
      const response = await axios.get(`${this.jinaSearchUrl}/${encodeURIComponent(searchQuery)}`, {
        timeout: 10000,
      });
      
      const text = response.data;
      const lines = text.split('\n');
      let answer = "";
      const sources = [];
      let currentSource = {};
      
      for (const line of lines) {
        if (line.startsWith('Title: ')) {
          if (currentSource.title && currentSource.url) {
            sources.push(currentSource);
          }
          currentSource = { title: line.replace('Title: ', '').trim(), url: '', snippet: '' };
        } else if (line.startsWith('URL: ')) {
          currentSource.url = line.replace('URL: ', '').trim();
        } else if (line.trim() !== '' && !line.startsWith('---')) {
          if (!currentSource.snippet) {
            currentSource.snippet = line.trim().substring(0, 300);
          }
          if (sources.length === 0 && answer.length < 1500) {
            answer += line + '\n';
          }
        }
      }
      if (currentSource.title && currentSource.url) {
        sources.push(currentSource);
      }

      return {
        answer: answer.trim() || "I found some web results regarding your repair.",
        sources: sources.slice(0, maxResults).map(s => ({
          title: s.title || "Web Result",
          url: s.url || "",
          snippet: s.snippet || ""
        })),
      };
    } catch (error) {
      console.warn("Jina Search failed, falling back to Tavily:", error.message);
      return this._tavilySearch(query, maxResults);
    }
  }

  async _tavilySearch(query, maxResults) {
    if (!this.tavilyApiKey) {
      console.warn("No Tavily API key provided. Returning helpful fallback message.");
      return { 
        answer: "I couldn't fetch live web results right now, but I recommend checking the official manufacturer's support site or YouTube for step-by-step visual guides.", 
        sources: [] 
      };
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
      return { answer: "I couldn't find specific web results for this.", sources: [] };
    }
  }
}