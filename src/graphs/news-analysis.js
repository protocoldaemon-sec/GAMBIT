/**
 * News Analysis Graph
 * LangGraph workflow for news scraping and sentiment analysis
 * Compatible with LangSmith Studio
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { searchNews, fetchArticle } from "../intelligence/scraper.js";
import { getMultiLLM } from "../llm/index.js";

// State definition
const NewsAnalysisState = Annotation.Root({
  // Input
  query: Annotation({ reducer: (_, b) => b }),
  maxArticles: Annotation({ reducer: (_, b) => b, default: () => 5 }),
  
  // Intermediate
  articles: Annotation({ reducer: (_, b) => b, default: () => [] }),
  analyzedArticles: Annotation({ reducer: (_, b) => b, default: () => [] }),
  
  // Output
  sentiment: Annotation({ reducer: (_, b) => b }),
  summary: Annotation({ reducer: (_, b) => b }),
  
  // Metadata
  messages: Annotation({ reducer: (a, b) => [...(a || []), ...b], default: () => [] }),
});

// Node: Search news
async function searchNewsNode(state) {
  const { query, maxArticles } = state;
  
  console.log(`[Graph] Searching news: ${query}`);
  
  try {
    const results = await searchNews(query, { limit: maxArticles || 5 });
    
    return {
      articles: results.articles,
      messages: [{
        role: "system",
        content: `Found ${results.articles.length} articles for "${query}"`,
      }],
    };
  } catch (error) {
    return {
      articles: [],
      messages: [{ role: "system", content: `Search error: ${error.message}` }],
    };
  }
}

// Node: Fetch article content
async function fetchArticlesNode(state) {
  const { articles } = state;
  
  console.log(`[Graph] Fetching ${articles.length} articles`);
  
  const fetched = [];
  
  for (const article of articles.slice(0, 5)) {
    try {
      const full = await fetchArticle(article.url);
      fetched.push({ ...article, content: full.content });
    } catch {
      fetched.push({ ...article, content: article.title });
    }
  }
  
  return {
    articles: fetched,
    messages: [{
      role: "system",
      content: `Fetched content for ${fetched.length} articles`,
    }],
  };
}


// Node: Analyze each article
async function analyzeArticlesNode(state) {
  const { articles, query } = state;
  
  console.log(`[Graph] Analyzing ${articles.length} articles`);
  
  const llm = getMultiLLM();
  const analyzed = [];
  
  for (const article of articles) {
    try {
      const prompt = `Analyze this news article's sentiment regarding "${query}".

Title: ${article.title}
Content: ${(article.content || "").slice(0, 1500)}

Respond in JSON:
{
  "sentiment": "positive" | "negative" | "neutral",
  "relevance": 0.0-1.0,
  "keyPoints": ["point1", "point2"]
}`;

      const result = await llm.complete(prompt, { task: "sentiment", temperature: 0 });
      const content = result.content.replace(/```json\n?|\n?```/g, "").trim();
      const analysis = JSON.parse(content);
      
      analyzed.push({
        title: article.title,
        url: article.url,
        source: article.source,
        ...analysis,
      });
    } catch {
      analyzed.push({
        title: article.title,
        url: article.url,
        sentiment: "neutral",
        relevance: 0.5,
        keyPoints: [],
      });
    }
  }
  
  return {
    analyzedArticles: analyzed,
    messages: [{
      role: "system",
      content: `Analyzed ${analyzed.length} articles`,
    }],
  };
}

// Node: Aggregate sentiment
async function aggregateSentimentNode(state) {
  const { analyzedArticles, query } = state;
  
  console.log(`[Graph] Aggregating sentiment`);
  
  const counts = { positive: 0, negative: 0, neutral: 0 };
  let totalRelevance = 0;
  
  for (const article of analyzedArticles) {
    counts[article.sentiment]++;
    totalRelevance += article.relevance || 0;
  }
  
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const confidence = analyzedArticles.length > 0 
    ? counts[dominant] / analyzedArticles.length 
    : 0;
  
  return {
    sentiment: {
      dominant,
      counts,
      confidence,
      avgRelevance: analyzedArticles.length > 0 ? totalRelevance / analyzedArticles.length : 0,
    },
    messages: [{
      role: "assistant",
      content: `Sentiment: ${dominant.toUpperCase()} (${(confidence * 100).toFixed(0)}% confidence)`,
    }],
  };
}

// Node: Generate summary
async function generateSummaryNode(state) {
  const { analyzedArticles, query, sentiment } = state;
  
  console.log(`[Graph] Generating summary`);
  
  const llm = getMultiLLM();
  
  const articlesText = analyzedArticles
    .map(a => `- ${a.title} (${a.sentiment}): ${a.keyPoints?.join(", ") || "N/A"}`)
    .join("\n");
  
  const prompt = `Summarize these news articles about "${query}".

Overall Sentiment: ${sentiment.dominant} (${(sentiment.confidence * 100).toFixed(0)}% confidence)

Articles:
${articlesText}

Provide a concise 2-3 sentence summary of the key developments and their implications.`;

  try {
    const result = await llm.complete(prompt, { task: "analysis" });
    
    return {
      summary: result.content,
      messages: [{
        role: "assistant",
        content: result.content,
      }],
    };
  } catch (error) {
    return {
      summary: `Found ${analyzedArticles.length} articles with ${sentiment.dominant} sentiment.`,
      messages: [{ role: "system", content: `Summary error: ${error.message}` }],
    };
  }
}

// Build graph
const workflow = new StateGraph(NewsAnalysisState)
  .addNode("search", searchNewsNode)
  .addNode("fetch", fetchArticlesNode)
  .addNode("analyze", analyzeArticlesNode)
  .addNode("aggregate", aggregateSentimentNode)
  .addNode("summarize", generateSummaryNode)
  .addEdge(START, "search")
  .addEdge("search", "fetch")
  .addEdge("fetch", "analyze")
  .addEdge("analyze", "aggregate")
  .addEdge("aggregate", "summarize")
  .addEdge("summarize", END);

// Export compiled graph
export const graph = workflow.compile();

export default graph;
