/**
 * Web Scraper & News Crawler
 * Fetches news and content from various sources
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/**
 * Fetch webpage content
 */
export async function fetchPage(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

/**
 * Extract text content from HTML (simple extraction)
 */
export function extractText(html) {
  // Remove scripts, styles, and HTML tags
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract article metadata from HTML
 */
export function extractMetadata(html, url) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const publishedMatch = html.match(/["'](?:datePublished|publishedTime)["']\s*:\s*["']([^"']+)["']/i);

  return {
    url,
    title: ogTitleMatch?.[1] || titleMatch?.[1] || "",
    description: ogDescMatch?.[1] || descMatch?.[1] || "",
    publishedAt: publishedMatch?.[1] || null,
  };
}


/**
 * Search Google News (via RSS)
 */
export async function searchGoogleNews(query, options = {}) {
  const { limit = 10, language = "en" } = options;
  const encodedQuery = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=${language}&gl=US&ceid=US:en`;

  const xml = await fetchPage(url);
  const articles = [];

  // Parse RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < limit) {
    const item = match[1];
    const title = item.match(/<title>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/title>/)?.[1] || "";
    const link = item.match(/<link>([^<]+)<\/link>/)?.[1] || "";
    const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || "";
    const source = item.match(/<source[^>]*>([^<]+)<\/source>/)?.[1] || "";

    articles.push({
      title: title.trim(),
      url: link.trim(),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      source: source.trim(),
    });
  }

  return articles;
}

/**
 * Search news from multiple sources
 */
export async function searchNews(query, options = {}) {
  const results = {
    query,
    timestamp: new Date().toISOString(),
    articles: [],
    errors: [],
  };

  // Google News
  try {
    const googleNews = await searchGoogleNews(query, options);
    results.articles.push(...googleNews.map(a => ({ ...a, provider: "google" })));
  } catch (error) {
    results.errors.push({ provider: "google", error: error.message });
  }

  // Sort by date
  results.articles.sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  return results;
}

/**
 * Fetch and extract article content
 * Falls back to Firecrawl if available
 */
export async function fetchArticle(url) {
  // Try Firecrawl first if available
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      const { scrapeUrl } = await import("./firecrawl.js");
      const result = await scrapeUrl(url);
      return {
        url,
        title: result.metadata?.title || "",
        description: result.metadata?.description || "",
        content: result.markdown?.slice(0, 5000) || "",
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[Scraper] Firecrawl failed, falling back:", error.message);
    }
  }

  // Fallback to basic fetch
  const html = await fetchPage(url);
  const metadata = extractMetadata(html, url);
  const text = extractText(html);

  // Extract main content (heuristic: longest paragraph block)
  const paragraphs = text.split(/\.\s+/).filter(p => p.length > 50);
  const content = paragraphs.slice(0, 20).join(". ");

  return {
    ...metadata,
    content: content.slice(0, 5000),
    fetchedAt: new Date().toISOString(),
  };
}

export default { fetchPage, extractText, extractMetadata, searchGoogleNews, searchNews, fetchArticle };
