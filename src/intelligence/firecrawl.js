/**
 * Firecrawl Integration
 * Professional web scraping with Firecrawl API
 */
import FirecrawlApp from "@mendable/firecrawl-js";

let firecrawlClient = null;

/**
 * Get Firecrawl client
 */
export function getFirecrawl() {
  if (!firecrawlClient) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error("FIRECRAWL_API_KEY not set");
    }
    firecrawlClient = new FirecrawlApp({ apiKey });
  }
  return firecrawlClient;
}

/**
 * Scrape a single URL
 */
export async function scrapeUrl(url, options = {}) {
  const firecrawl = getFirecrawl();
  
  const result = await firecrawl.scrapeUrl(url, {
    formats: options.formats || ["markdown"],
    onlyMainContent: options.onlyMainContent ?? true,
    waitFor: options.waitFor || 0,
    ...options,
  });

  if (!result.success) {
    throw new Error(`Scrape failed: ${result.error || "Unknown error"}`);
  }

  return {
    url,
    markdown: result.markdown || "",
    html: result.html || "",
    metadata: result.metadata || {},
    links: result.links || [],
  };
}

/**
 * Scrape multiple URLs
 */
export async function scrapeUrls(urls, options = {}) {
  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const result = await scrapeUrl(url, options);
      results.push(result);
    } catch (error) {
      errors.push({ url, error: error.message });
    }
  }

  return { results, errors };
}

/**
 * Crawl a website (multiple pages)
 */
export async function crawlSite(url, options = {}) {
  const firecrawl = getFirecrawl();

  const result = await firecrawl.crawlUrl(url, {
    limit: options.limit || 10,
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
    ...options,
  });

  return {
    url,
    pages: result.data || [],
    total: result.total || 0,
  };
}


/**
 * Search and scrape (find relevant pages then scrape)
 */
export async function searchAndScrape(query, options = {}) {
  const firecrawl = getFirecrawl();

  // Use map to search and extract
  const result = await firecrawl.mapUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
    search: query,
    limit: options.limit || 5,
  });

  if (!result.success || !result.links) {
    return { query, results: [], error: result.error };
  }

  // Scrape top results
  const scraped = await scrapeUrls(result.links.slice(0, options.scrapeLimit || 3));

  return {
    query,
    links: result.links,
    scraped: scraped.results,
    errors: scraped.errors,
  };
}

/**
 * Extract structured data from URL
 */
export async function extractData(url, schema, options = {}) {
  const firecrawl = getFirecrawl();

  const result = await firecrawl.scrapeUrl(url, {
    formats: ["extract"],
    extract: {
      schema,
      systemPrompt: options.systemPrompt,
    },
  });

  if (!result.success) {
    throw new Error(`Extract failed: ${result.error}`);
  }

  return {
    url,
    data: result.extract,
    metadata: result.metadata,
  };
}

/**
 * Extract news article data
 */
export async function extractNewsArticle(url) {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      author: { type: "string" },
      publishedDate: { type: "string" },
      summary: { type: "string" },
      mainContent: { type: "string" },
      topics: { type: "array", items: { type: "string" } },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
    },
    required: ["title", "mainContent"],
  };

  return extractData(url, schema, {
    systemPrompt: "Extract news article information. Determine sentiment based on content tone.",
  });
}

export default {
  getFirecrawl,
  scrapeUrl,
  scrapeUrls,
  crawlSite,
  searchAndScrape,
  extractData,
  extractNewsArticle,
};
