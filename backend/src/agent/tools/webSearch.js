import axios from "axios";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_URL = "https://api.tavily.com/search";

/**
 * Web search fallback using Tavily
 */
export async function webSearch(query) {
  try {
    const res = await axios.post(TAVILY_URL, {
      api_key: TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    });

    return {
      answer: res.data.answer || null,
      sources: (res.data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  } catch (error) {
    console.error("Tavily error:", error.response?.data || error.message);
    return null;
  }
}
