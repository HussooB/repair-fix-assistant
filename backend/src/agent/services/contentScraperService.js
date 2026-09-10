import axios from "axios";

export class ContentScraperService {
  constructor() {
    this.jinaBaseUrl = "https://r.jina.ai";
  }

  async scrapeUrl(url) {
    try {
      // Jina Reader is free and bypasses anti-bot
      const response = await axios.get(`${this.jinaBaseUrl}/${url}`, {
        timeout: 8000,
      });
      return { 
        url, 
        content: response.data, 
        success: true 
      };
    } catch (error) {
      console.error(`Jina scrape failed for ${url}:`, error.message);
      return { url, content: "", success: false };
    }
  }

  async scrapeTopUrls(sources, limit = 2) {
    const urls = sources.slice(0, limit).map(s => s.url);
    const results = [];
    
    // Scrape sequentially with delay to be polite
    for (const url of urls) {
      const scraped = await this.scrapeUrl(url);
      if (scraped.success) results.push(scraped);
      await new Promise(r => setTimeout(r, 500)); // 500ms delay
    }
    return results;
  }
}