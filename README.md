# Gambit

Federated Multi-Agent System for Prediction Market Trading on Kalshi via DFlow.

## Overview

Gambit is an AI-powered quantitative trading system:

- **Continuous Learning**: 24/7 model retraining daemon
- **Hidden Markov Model**: Regime detection from market data
- **Regime Shift Detection**: Adaptive strategy based on market conditions
- **Kelly Criterion**: Dynamic position sizing with regime adjustments
- **Monte Carlo Simulation**: Risk analysis and outcome prediction
- **Self-Healing Agent**: Automatic vulnerability detection and remediation
- **Multi-LLM Support**: OpenRouter integration with reasoning models
- **Vanity Wallets**: Unique `gam...` addresses per user
- **On-chain Settlement**: Solana-based execution via DFlow

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. LOGIN → Vanity wallet generated (gam... prefix)             │
│                                                                 │
│  2. DEPOSIT → Send SOL/USDC to agent wallet                     │
│             → External wallet auto-registered                   │
│                                                                 │
│  3. TRADE → "Buy YES on election market"                        │
│           → Agent executes via DFlow on Kalshi                  │
│                                                                 │
│  4. WITHDRAW → "Pay me back" / "Repay"                          │
│              → Agent sends to registered wallet                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

```
                    ┌──────────────────┐
                    │   HTTP API :3000 │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Kafka Cluster   │
                    └────────┬─────────┘
                             │
    ┌────────┬───────┬───────┼───────┬────────┬────────┐
    ▼        ▼       ▼       ▼       ▼        ▼        ▼
┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐
│Market ││Trading││Analyt.││Simul. ││ Risk  ││Solana ││Wallet │
│Discov.││       ││       ││       ││       ││       ││       │
└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘
    │        │        │        │        │        │        │
    └────────┴────────┴────────┴────────┴────────┴────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   ┌──────────┐       ┌──────────┐       ┌──────────┐
   │  Kalshi  │       │  DFlow   │       │ Supabase │
   │   API    │       │   API    │       │          │
   └──────────┘       └──────────┘       └──────────┘
```

## Agents

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| **Intelligence** | News & sentiment analysis | `search_news`, `get_market_intelligence`, `analyze_sentiment` |
| **Wallet** | Deposits & withdrawals | `check_balance`, `withdraw_to_user`, `fund_kalshi` |
| **Trading** | Execute trades via DFlow | `get_quote`, `execute_trade` |
| **Simulation** | Monte Carlo & stress tests | `run_monte_carlo`, `run_stress_test` |
| **Risk** | VaR, position sizing | `calculate_risk_metrics`, `calculate_position_size` |
| **Solana** | On-chain operations | `swap_tokens`, `transfer_sol`, `stake_sol` |
| **Analytics** | Market analysis | `analyze_market_trend`, `compare_markets` |
| **Market Discovery** | Find markets | `list_markets`, `get_market_details` |

## Quick Start

### 1. Install & Configure

```bash
npm install
cp .env.example .env
# Edit .env with your keys
```

### 2. Start Gambit Learning Daemon

```bash
npm run start:daemon
```

This starts the 24/7 learning daemon that:
- Retrains HMM every 6 hours
- Updates regime detection every hour
- Recalibrates Kelly every 30 minutes
- Runs Monte Carlo simulations every 15 minutes
- Monitors and fixes vulnerabilities

### 3. Start Services

```bash
# Kafka
docker-compose up -d

# API Server
npm run start:api

# Workers (each in separate terminal)
npm run start:orchestrator
npm run start:wallet
npm run start:trading
npm run start:simulation
npm run start:risk
npm run start:solana
npm run start:analytics
npm run start:market-discovery
npm run start:intelligence
npm run start:health
npm run start:dlq
```

## API Endpoints

### Auth
```bash
# Login (creates vanity wallet)
POST /auth/login
{"userId": "user123", "email": "user@example.com"}

# Get user info
GET /auth/me
Header: X-Session-Id: <sessionId>
```

### Wallet
```bash
# Get balance
GET /wallet/balance

# Get deposit address
GET /wallet/deposit-address

# Withdraw
POST /wallet/withdraw
{"amount": 10, "token": "USDC"}

# Transaction history
GET /wallet/transactions
```

## Example Commands

```
"What's my balance?"
"Show my deposit address"
"Withdraw 10 USDC"
"Pay me back"
"Fund Kalshi with 50 USDC"
"Buy YES on PRES-2024 for $100"
"Run Monte Carlo on FED-RATE with $1000 position"
"What's my VaR at 95%?"
"Stress test my portfolio"
```

## Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
KAFKA_BROKERS=localhost:9092

# Optional
KALSHI_DEPOSIT_ADDRESS=...
API_PORT=3000
HEALTH_PORT=3001
DLQ_PORT=3002
```

## Gambit Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAMBIT LEARNING DAEMON                              │
│                    (Continuous Learning & Self-Healing)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  HMM Trainer    │  │ Regime Detector │  │ Kelly Calibrator│             │
│  │  (6h interval)  │  │  (1h interval)  │  │ (30m interval)  │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                    ┌───────────▼───────────┐                               │
│                    │   Model Persistence   │                               │
│                    │     (Supabase)        │                               │
│                    └───────────────────────┘                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SELF-HEALING AGENT                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ Vuln Logger │→ │ Code Review │→ │ Auto-Fixer  │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │ Monte Carlo  │ │ Stress Test  │ │ Risk Metrics │
            │  Simulator   │ │   Engine     │ │  Calculator  │
            └──────────────┘ └──────────────┘ └──────────────┘
```

## LangSmith Studio

Gambit graphs are compatible with LangSmith Studio for visual debugging and testing.

### Start Local Server

```bash
# Start LangGraph dev server
npm run langgraph:dev

# With tunnel (for Safari)
npm run langgraph:studio
```

Then open: `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`

### Available Graphs

| Graph | Description | Input |
|-------|-------------|-------|
| `market_intel` | Market intelligence analysis | `{ ticker: "PRES-2024" }` |
| `news_analysis` | News search and sentiment | `{ query: "election polls" }` |
| `trading` | Full trading decision | `{ ticker: "...", portfolioValue: 10000 }` |

### Graph Workflows

```
market_intel:    fetchMarket → fetchNews → analyze → generateSignal
news_analysis:   search → fetch → analyze → aggregate → summarize
trading:         fetchMarket → detectRegime → runSimulation → calculateKelly → makeDecision
```

## Multi-LLM System

Gambit uses OpenRouter for multi-model support:

### Available Models

| Model | ID | Reasoning | Cost |
|-------|-----|-----------|------|
| DeepSeek V3.2 | `deepseek/deepseek-v3.2` | ✅ | Low |
| Nemotron 3 | `nvidia/nemotron-3-nano-30b-a3b:free` | ✅ | Free |
| Devstral | `mistralai/devstral-2512:free` | ❌ | Free |
| DeepSeek NEX | `nex-agi/deepseek-v3.1-nex-n1:free` | ❌ | Free |
| GPT-4o | `openai/gpt-4o` | ❌ | High |
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | ❌ | High |

### Task-Based Model Selection

```javascript
import { getMultiLLM } from "./llm/index.js";

const llm = getMultiLLM({ preferFree: true });

// Simple completion
const result = await llm.complete("Analyze this market...");

// With reasoning (uses DeepSeek V3 or Nemotron)
const reasoned = await llm.reason("Should I buy YES on this market?");
console.log(reasoned.reasoning); // Step-by-step reasoning

// Multi-turn reasoning chain
const chain = await llm.reasonChain(
  "Analyze election market PRES-2024",
  ["What about recent polls?", "Final recommendation?"]
);

// Sentiment analysis (optimized model)
const sentiment = await llm.analyzeSentiment(newsText, { marketTitle: "..." });
```

### Automatic Fallbacks

If a model fails, Gambit automatically falls back:
1. Premium → Medium tier → Free tier
2. Reasoning models have dedicated fallback chain

## Intelligence System

The Intelligence Agent provides:

- **Firecrawl Integration**: Professional web scraping with structured extraction
- **LangGraph Workflows**: Multi-step agent workflows for analysis
- **News Search**: Search Google News for relevant articles
- **Sentiment Analysis**: Multi-LLM powered sentiment analysis
- **Market Intelligence**: Combined news + liquidity + sentiment signals

### LangGraph Workflows

```javascript
import { analyzeNewsWorkflow, analyzeMarketWorkflow, scanMarketsWorkflow } from "./intelligence/workflows.js";

// News analysis workflow (search → scrape → analyze)
const newsResult = await analyzeNewsWorkflow("election polls 2024");
console.log(newsResult.sentiment); // { dominant: "positive", confidence: 0.8 }

// Market intelligence workflow (market data → news → analysis → signal)
const marketResult = await analyzeMarketWorkflow("PRES-2024");
console.log(marketResult.signal); // { action: "BUY", side: "yes", confidence: 0.75 }

// Scan multiple markets
const scan = await scanMarketsWorkflow(["PRES-2024", "FED-RATE", "GDP-Q1"]);
console.log(scan.topPick); // Best trading opportunity
```

### Firecrawl Features

```javascript
import { scrapeUrl, extractNewsArticle, crawlSite } from "./intelligence/firecrawl.js";

// Scrape single URL
const page = await scrapeUrl("https://example.com");

// Extract structured news data
const article = await extractNewsArticle("https://news.example.com/article");
console.log(article.data); // { title, author, sentiment, topics, ... }

// Crawl entire site
const site = await crawlSite("https://example.com", { limit: 10 });
```

### Signal Generation

Signals are generated based on:
1. **Sentiment Score** (60%): Aggregated news sentiment
2. **Liquidity Score** (20%): Order book depth and volume
3. **Spread Score** (20%): Bid-ask spread quality

## Quantitative Methods

### Hidden Markov Model (HMM)
- 3 hidden states: BULL, SIDEWAYS, BEAR
- Trained on historical returns using Baum-Welch algorithm
- Viterbi decoding for state sequence prediction

### Regime Detection
- Combines HMM, volatility analysis, and trend strength
- Outputs: RISK_ON, NEUTRAL, RISK_OFF
- Automatic strategy adjustment based on regime

### Kelly Criterion
- Regime-adjusted position sizing
- Volatility-aware multipliers
- Half-Kelly default for conservative sizing

### Monte Carlo Simulation
- GBM price path simulation
- VaR/CVaR calculation
- Stress testing across 6 scenarios

## Project Structure

```
src/
├── agents/              # Agent definitions
├── api/                 # HTTP API (auth, server)
├── auth/                # Session, vanity wallet
├── kafka/               # Kafka client & messages
├── graphs/              # LangGraph workflows (Studio compatible)
│   ├── market-intel.js  # Market intelligence graph
│   ├── news-analysis.js # News analysis graph
│   └── trading.js       # Trading decision graph
├── llm/                 # Multi-LLM system
│   ├── openrouter.js    # OpenRouter client
│   ├── multi-llm.js     # LLM orchestrator
│   └── index.js
├── intelligence/        # News scraping & sentiment
│   ├── scraper.js       # Basic web crawler
│   ├── firecrawl.js     # Firecrawl integration
│   ├── workflows.js     # LangGraph workflows
│   ├── sentiment.js     # Sentiment analysis
│   └── market-intel.js  # Market intelligence
├── learning/            # Continuous learning system
│   ├── daemon.js        # Main ALADDIN daemon
│   ├── trainer.js       # Continuous model trainer
│   ├── self-healing-agent.js
│   └── vulnerability-logger.js
├── mcp/                 # MCP server adapter
├── plugins/             # Plugin system (Token, DeFi)
├── quant/               # Quantitative methods
│   ├── hmm.js           # Hidden Markov Model
│   ├── regime-detector.js
│   └── kelly.js         # Kelly Criterion
├── simulation/          # Monte Carlo, stress tests
├── solana/              # Solana client
├── supabase/            # DB client & schema
├── utils/               # Retry, health, DLQ
├── wallet/              # Treasury management
└── workers/             # Kafka workers
```

## Plugin System

Gambit uses a plugin architecture inspired by solana-agent-kit:

### Token Plugin
- `GET_BALANCE` - Get SOL balance
- `GET_TOKEN_BALANCE` - Get SPL token balance
- `GET_ALL_BALANCES` - Get all balances
- `TRANSFER` - Transfer SOL/tokens
- `TRADE` - Swap via Jupiter

### DeFi Plugin
- `GET_KALSHI_QUOTE` - Get trade quote
- `EXECUTE_KALSHI_TRADE` - Execute trade via DFlow
- `GET_KALSHI_POSITIONS` - Get user positions
- `LIST_KALSHI_MARKETS` - List markets
- `GET_KALSHI_MARKET` - Get market details
- `GET_KALSHI_ORDERBOOK` - Get orderbook

### Creating Custom Plugins

```javascript
import { createPlugin, createAction } from "./plugins/base.js";
import { z } from "zod";

const myAction = createAction({
  name: "MY_ACTION",
  description: "Does something cool",
  schema: z.object({ param: z.string() }),
  handler: async (ctx, input) => {
    return { result: input.param };
  },
});

const MyPlugin = createPlugin({
  name: "my-plugin",
  methods: { myTool },
  actions: [myAction],
});
```

## MCP Server

Run Gambit as an MCP server for AI assistants:

```bash
npm run start:mcp
```

Configure in your MCP client:
```json
{
  "mcpServers": {
    "gambit": {
      "command": "node",
      "args": ["src/mcp/server.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
        "KALSHI_API_KEY": "your-key",
        "DFLOW_API_KEY": "your-key"
      }
    }
  }
}
```

## Security

- Vanity wallets generated per user (`gam...` prefix)
- External wallet auto-registered from first deposit
- Private keys encrypted in Supabase (use KMS in production)
- Row Level Security on all user tables
- Session-based authentication

## Monitoring

- **Health**: `http://localhost:3001/health`
- **DLQ**: `http://localhost:3002/dlq`
- **Kafka UI**: `http://localhost:8080`

## License

Apache-2.0
