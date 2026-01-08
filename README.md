# Gambit

**Federated Multi-Agent System for Prediction Market Trading**

Gambit is an AI-powered quantitative trading system for prediction markets on [Kalshi](https://kalshi.com) with on-chain settlement via [DFlow](https://dflow.net). It combines institutional-grade quantitative methods with modern AI capabilities to automate market analysis, risk management, and trade execution.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   "Buy YES on election market"                                              │
│                                                                             │
│         │                                                                   │
│         ▼                                                                   │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐        │
│   │  Wallet   │    │   Risk    │    │  Trading  │    │  Execute  │        │
│   │  Check    │───▶│  Analysis │───▶│  Decision │───▶│  on-chain │        │
│   └───────────┘    └───────────┘    └───────────┘    └───────────┘        │
│                                                                             │
│   "Executed 100 YES @ $0.65 | Kelly: 8% | VaR95: $12.50"                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Multi-Agent System
- 8 Specialized Agents: Wallet, Trading, Risk, Simulation, Analytics, Intelligence, Solana, Market Discovery
- Kafka-based Communication: Reliable message passing with dead-letter queue
- Parallel Execution: Agents work concurrently for faster response times

### Quantitative Methods
- Hidden Markov Model (HMM): Regime detection from market data
- Kelly Criterion: Optimal position sizing with regime adjustments
- Monte Carlo Simulation: 10,000 iteration risk analysis
- Stress Testing: 6 predefined scenarios (Black Swan, Flash Crash, etc.)

### Continuous Learning
- 24/7 Learning Daemon: Automatic model retraining
- Self-Healing Agent: Vulnerability detection and auto-remediation
- Adaptive Strategies: Regime-based strategy switching

### Market Intelligence
- News Aggregation: Google News RSS + Firecrawl scraping
- Sentiment Analysis: Multi-LLM powered analysis
- Signal Generation: Combined news + liquidity + sentiment signals

### DFlow Integration
- Swap API: Imperative and declarative token swaps on Solana
- Prediction Market Metadata: Events, markets, orderbooks, trades from Kalshi
- WebSocket Streaming: Real-time prices, trades, orderbook updates
- On-chain Settlement: Solana-based execution with Jito MEV protection
- Sync/Async Execution: Atomic and multi-transaction support

### Kalshi API Integration
- Official TypeScript SDK: Full API coverage with type safety
- WebSocket Streaming: Real-time orderbook, ticker, trade, and fill updates
- Sub-penny Pricing: Support for 4-decimal precision pricing
- Error Handling: Comprehensive retry strategies with exponential backoff
- Exchange Status: Automatic trading hours and maintenance detection

### Secure Wallet System
- Vanity Addresses: Unique `gam...` prefix per user
- Auto-registration: External wallet captured from deposits
- Encrypted Storage: AES-256 key encryption

---

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
       ┌────────┬────────┬─────────────┼─────────────┬────────┬────────┐
       ▼        ▼        ▼             ▼             ▼        ▼        ▼
   ┌───────┐┌───────┐┌───────┐   ┌───────────┐   ┌───────┐┌───────┐┌───────┐
   │Wallet ││Trading││ Risk  │   │Orchestrator│  │Simul. ││Intel. ││Solana │
   │ Agent ││ Agent ││ Agent │   │            │  │ Agent ││ Agent ││ Agent │
   └───┬───┘└───┬───┘└───┬───┘   └─────┬─────┘  └───┬───┘└───┬───┘└───┬───┘
       │        │        │             │             │        │        │
       └────────┴────────┴─────────────┼─────────────┴────────┴────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
      ┌──────────┐              ┌──────────┐              ┌──────────┐
      │  Kalshi  │              │  DFlow   │              │ Supabase │
      │   API    │              │Trade API │              │    DB    │
      └──────────┘              └──────────┘              └──────────┘
```

### Agent Responsibilities

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| Orchestrator | Route requests, synthesize responses | Router LLM, Kafka dispatch |
| Wallet | Deposits, withdrawals, balances | `check_balance`, `withdraw_to_user` |
| Trading | Execute trades via DFlow | `get_quote`, `execute_trade` |
| Risk | VaR, position sizing | `calculate_risk_metrics`, `position_size` |
| Simulation | Monte Carlo, stress tests | `run_monte_carlo`, `stress_test` |
| Intelligence | News, sentiment, signals | `search_news`, `analyze_sentiment` |
| Solana | On-chain operations | `swap_tokens`, `transfer_sol` |
| Analytics | Market analysis | `analyze_trend`, `compare_markets` |

---

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Docker & Docker Compose
- API Keys: OpenRouter, Kalshi, DFlow, Supabase

### Installation

```bash
git clone https://github.com/your-org/gambit.git
cd gambit
npm install
cp .env.example .env
```

### Configuration

```env
# Required
OPENROUTER_API_KEY=sk-or-v1-...
KALSHI_API_KEY=your-kalshi-key
KALSHI_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
DFLOW_API_KEY=your-dflow-key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional
FIRECRAWL_API_KEY=fc-...
LANGSMITH_API_KEY=lsv2_pt_...
```

### Start Services

```bash
# Infrastructure
docker-compose up -d

# Learning daemon
npm run start:daemon

# API server
npm run start:api

# Orchestrator
npm run start:orchestrator

# Agent workers
npm run start:wallet &
npm run start:trading &
npm run start:risk &
npm run start:simulation &
npm run start:intelligence &
npm run start:solana &
```

### LangGraph Studio

```bash
npm run langgraph:dev
# Open: https://smith.langchain.com/studio?baseUrl=http://localhost:2024
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product Requirements Document |
| [Pipeline](docs/PIPELINE.md) | Agent hierarchy and data flow |
| [Setup](SETUP.md) | Detailed setup instructions |

---

## API

### Authentication

```bash
POST /auth/login
Content-Type: application/json

{"userId": "user123", "email": "user@example.com"}
```

Response:
```json
{
  "sessionId": "sess_abc123",
  "wallet": { "address": "gamXyz..." }
}
```

### Chat Interface

```bash
POST /api/chat
X-Session-Id: sess_abc123
Content-Type: application/json

{"query": "Buy YES on PRES-2024 for $100"}
```

Response:
```json
{
  "response": "Executed 100 YES @ $0.65...",
  "agents": ["wallet", "risk", "trading"]
}
```

### Wallet Operations

```
GET  /wallet/balance           # Check balance
GET  /wallet/deposit-address   # Get deposit address
POST /wallet/withdraw          # Withdraw funds
GET  /wallet/transactions      # Transaction history
```

---

## Example Commands

**Wallet**
```
"What's my balance?"
"Show my deposit address"
"Withdraw 10 USDC"
"Pay me back"
```

**Trading**
```
"Buy YES on PRES-2024 for $100"
"Get quote for election market"
"Fund Kalshi with 50 USDC"
```

**Analysis**
```
"Run Monte Carlo on FED-RATE"
"What's my VaR at 95%?"
"Stress test my portfolio"
```

**Intelligence**
```
"Search news about Fed rate decision"
"What's the sentiment on crypto markets?"
"Compare PRES-2024 and FED-RATE markets"
```

---

## DFlow API

### Swap API (Imperative)

```javascript
import { DFlowClient, TOKENS } from "./src/plugins/defi/tools/dflow.js";

const client = new DFlowClient();

// Get quote for token swap
const quote = await client.getQuote({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000, // 1 SOL in lamports
  slippageBps: 50,
});

// Execute swap with monitoring
const result = await client.swap({
  inputMint: TOKENS.SOL,
  outputMint: TOKENS.USDC,
  amount: 1_000_000_000,
  slippageBps: 50,
});
// { status: "closed", signature: "...", fills: [...] }
```

### Declarative Swaps (Intent-based)

```javascript
// Better for larger orders with less slippage
const intentQuote = await client.getIntentQuote({
  inputMint: TOKENS.USDC,
  outputMint: TOKENS.SOL,
  amount: 100_000_000, // 100 USDC
  slippageBps: 30,
});

// Submit intent swap
const result = await client.submitIntentSwap(intentQuote);
```

### Prediction Market Metadata

```javascript
// Search events
const events = await client.searchEvents("election");

// Get markets for an event
const markets = await client.getMarkets({ eventTicker: "PRES-2024" });

// Get orderbook
const orderbook = await client.getOrderbook("PRES-2024-DJT");

// Get live data from Kalshi
const liveData = await client.getLiveData({ eventTicker: "PRES-2024" });

// Get market candlesticks
const candles = await client.getMarketCandlesticks("PRES-2024-DJT", {
  interval: "1h",
});
```

### WebSocket Streaming

```javascript
import { DFlowWebSocket } from "./src/plugins/defi/tools/dflow.js";

const ws = new DFlowWebSocket();
await ws.connect();

// Subscribe to all price updates
ws.subscribePrices(true);

// Subscribe to specific markets
ws.subscribeTrades(["PRES-2024-DJT", "FED-RATE-JAN"]);
ws.subscribeOrderbook(["PRES-2024-DJT"]);

// Handle events
ws.on("price", (data) => {
  console.log(`Price update: ${data.ticker} YES: ${data.yesBid}`);
});

ws.on("trade", (data) => {
  console.log(`Trade: ${data.ticker} ${data.count} @ ${data.price}`);
});

ws.on("orderbook", (data) => {
  console.log(`Orderbook update: ${data.ticker}`);
});
```

### Error Handling

```javascript
import { DFlowError } from "./src/plugins/defi/tools/dflow.js";

try {
  await client.getMarket("INVALID-TICKER");
} catch (error) {
  if (error instanceof DFlowError) {
    switch (error.code) {
      case "NOT_FOUND":
        console.log("Market not found");
        break;
      case "RATE_LIMIT":
        console.log(`Rate limited, retry after ${error.details.retryAfter}s`);
        break;
      case "AUTH_ERROR":
        console.log("Check your API key");
        break;
    }
  }
}
```

---

## Kalshi API

### REST API

```javascript
import kalshi from "./src/plugins/defi/tools/kalshi.js";

// Check exchange status before trading
const status = await kalshi.ensureTradingActive();

// Get markets
const { markets } = await kalshi.getMarkets(null, { status: "open", limit: 50 });

// Get orderbook with both dollar and cent values
const orderbook = await kalshi.getOrderbook(null, "PRES-2024-DJT");
// { yes: [{ price: 0.65, priceCents: 65, quantity: 100 }], ... }

// Get user balance
const balance = await kalshi.getBalance();
// { balance: 500.00, balanceCents: 50000, portfolioValue: 1200.00 }
```

### WebSocket Streaming

```javascript
import { KalshiWebSocket } from "./src/plugins/defi/tools/kalshi-ws.js";

const ws = new KalshiWebSocket({ environment: "production" });
await ws.connect();

// Subscribe to real-time updates
await ws.subscribeOrderbook("PRES-2024-DJT");
await ws.subscribeTicker("PRES-2024-DJT");

// Handle events
ws.on("ticker", (data) => {
  console.log(`${data.ticker}: YES $${data.yesPrice} | NO $${data.noPrice}`);
});

ws.on("orderbook_delta", (data) => {
  console.log(`Orderbook update: ${data.delta.side} @ $${data.delta.price}`);
});

// Get current orderbook state
const book = ws.getOrderbook("PRES-2024-DJT");
const bestPrices = ws.getBestPrices("PRES-2024-DJT");
```

### Error Handling

```javascript
import { KalshiError, KalshiErrorCodes } from "./src/plugins/defi/tools/kalshi.js";

try {
  await kalshi.getMarket(null, "INVALID-TICKER");
} catch (error) {
  if (error instanceof KalshiError) {
    switch (error.code) {
      case "UNKNOWN_SYMBOL":
        console.log("Market not found");
        break;
      case "EXCHANGE_CLOSED":
        console.log(`Exchange closed until ${error.details.estimatedResume}`);
        break;
      case "RATE_LIMIT":
        console.log(`Rate limited, retry after ${error.details.retryAfter}s`);
        break;
    }
  }
}
```

### Sub-penny Pricing

```javascript
import { 
  standardCentsToDollars, 
  dollarsToCents,
  formatPrice 
} from "./src/plugins/defi/tools/kalshi.js";

// API returns prices in cents (1-99)
const priceCents = 65;
const priceDollars = standardCentsToDollars(priceCents); // 0.65

// Convert back for API calls
const apiPrice = dollarsToCents(0.65); // 65

// Format for display
console.log(formatPrice(0.65)); // "$0.65"
```

---

## LangGraph Workflows

| Graph | Description | Input |
|-------|-------------|-------|
| `trading` | Full trading decision pipeline | `{ ticker, portfolioValue }` |
| `market_intel` | Market intelligence analysis | `{ ticker }` |
| `news_analysis` | News search and sentiment | `{ query }` |
| `dflow_swap` | Token swap with analysis | `{ inputToken, outputToken, amount }` |

```javascript
import { graph } from "./src/graphs/trading.js";

const result = await graph.invoke({
  ticker: "PRES-2024",
  portfolioValue: 10000,
  riskTolerance: 0.02,
});

// { action: "BUY", side: "yes", size: 80, confidence: 0.75 }
```

---

## Multi-LLM System

| Task | Primary Model | Fallback |
|------|---------------|----------|
| Reasoning | DeepSeek V3.2 | Nemotron 3 (free) |
| Analysis | GPT-4o | Gemini Pro |
| Sentiment | Claude Sonnet 4 | DeepSeek V3 |
| Code | Devstral (free) | DeepSeek NEX |

```javascript
import { getMultiLLM } from "./src/llm/index.js";

const llm = getMultiLLM({ preferFree: true });

// Simple completion
const result = await llm.complete("Analyze this market...");

// With reasoning
const reasoned = await llm.reason("Should I buy YES?");

// Sentiment analysis
const sentiment = await llm.analyzeSentiment(newsText);
```

---

## Quantitative Engine

### Hidden Markov Model

```javascript
import { HiddenMarkovModel } from "./src/quant/hmm.js";

const hmm = new HiddenMarkovModel({ nStates: 3 });
hmm.train(historicalReturns);
const regime = hmm.predict(recentReturns);
// { state: "BULL", probability: 0.85 }
```

### Kelly Criterion

```javascript
import { KellyCriterion } from "./src/quant/kelly.js";

const kelly = new KellyCriterion();
const sizing = kelly.calculateRegimeAdjustedKelly({
  currentPrice: 0.65,
  estimatedProbability: 0.72,
  side: "yes",
  regime: "RISK_ON",
});
// { adjustedKelly: 0.08, recommendedBetSize: 800 }
```

### Monte Carlo Simulation

```javascript
import { MonteCarloSimulator } from "./src/simulation/monte-carlo.js";

const simulator = new MonteCarloSimulator({ iterations: 10000 });
const result = await simulator.runSimulation({
  ticker: "PRES-2024",
  initialPrice: 0.65,
  volatility: 0.3,
  positionSize: 1000,
});
// { var95: -125, var99: -180, sharpeRatio: 1.2, winRate: 0.58 }
```

---

## Project Structure

```
gambit/
├── src/
│   ├── agents/           # Agent definitions (8 agents)
│   ├── api/              # HTTP API server
│   ├── auth/             # Session & vanity wallet
│   ├── graphs/           # LangGraph workflows
│   ├── intelligence/     # News, sentiment, Firecrawl
│   ├── kafka/            # Message broker client
│   ├── learning/         # Continuous learning daemon
│   ├── llm/              # Multi-LLM orchestrator
│   ├── mcp/              # MCP server adapter
│   ├── plugins/          # Plugin system (Token, DeFi)
│   ├── quant/            # HMM, regime, Kelly
│   ├── simulation/       # Monte Carlo, stress tests
│   ├── solana/           # Solana client
│   ├── supabase/         # Database client
│   ├── utils/            # Retry, health, DLQ
│   ├── wallet/           # Treasury management
│   └── workers/          # Kafka workers
├── docs/
│   ├── PRD.md            # Product requirements
│   └── PIPELINE.md       # Architecture docs
├── docker-compose.yml
├── langgraph.json
└── package.json
```

---

## Monitoring

| Endpoint | Purpose |
|----------|---------|
| `http://localhost:3001/health` | System health check |
| `http://localhost:3002/dlq` | Dead letter queue status |
| LangSmith Studio | Graph tracing and debugging |

---

## Security

- Wallet Isolation: Each user has dedicated vanity wallet
- Key Encryption: AES-256 encrypted private keys
- Row Level Security: Supabase RLS on all tables
- Session Management: JWT with expiration
- API Key Protection: Environment variables only

---

## License

Apache 2.0 - see [LICENSE](LICENSE) for details.
