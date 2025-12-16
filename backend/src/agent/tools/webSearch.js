import axios from "axios";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_URL = "https://api.tavily.com/search";

/**
 * Web search fallback (Tavily)
 * Used ONLY when intent confidence is low
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

    const data = res.data;

    return {
      answer: data?.answer || null,
      sources: (data?.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300) || "",
      })),
    };
  } catch (error) {
    console.error(
      "Tavily webSearch failed:",
      error.response?.data || error.message
    );
    return null;
  }
}
