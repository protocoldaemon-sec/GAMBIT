# Gambit - Product Requirements Document

## Executive Summary

Gambit is a federated multi-agent system for automated prediction market trading on Kalshi via DFlow's on-chain settlement infrastructure. The system employs continuous learning, quantitative methods, and AI-powered decision making to identify and execute profitable trading opportunities in prediction markets.

---

## 1. Product Overview

### 1.1 Vision

Build an autonomous, self-improving trading system that combines institutional-grade quantitative methods with modern AI capabilities to democratize access to sophisticated prediction market trading strategies.

### 1.2 Mission

Enable users to participate in prediction markets with:
- Automated market analysis and signal generation
- Risk-managed position sizing
- Continuous learning and adaptation
- Transparent, on-chain settlement

### 1.3 Target Users

| User Segment | Description | Primary Needs |
|--------------|-------------|---------------|
| Retail Traders | Individual prediction market participants | Easy-to-use interface, risk management |
| Quantitative Traders | Algorithmic trading enthusiasts | API access, customizable strategies |
| Developers | Builders integrating prediction markets | MCP server, plugin system |
| Institutions | Funds and trading desks | High-volume execution, compliance |

---

## 2. Problem Statement

### 2.1 Current Market Challenges

1. **Information Asymmetry**: Retail traders lack access to sophisticated analysis tools
2. **Manual Execution**: Trading requires constant monitoring and manual intervention
3. **Risk Management**: Most traders lack proper position sizing and risk controls
4. **Market Complexity**: Prediction markets require understanding of probability, news, and sentiment
5. **Settlement Friction**: Traditional prediction markets have slow, opaque settlement

### 2.2 Solution

Gambit addresses these challenges through:

| Challenge | Gambit Solution |
|-----------|-----------------|
| Information Asymmetry | Intelligence Agent with news scraping and sentiment analysis |
| Manual Execution | Automated trading via multi-agent orchestration |
| Risk Management | Kelly Criterion, Monte Carlo simulation, regime detection |
| Market Complexity | LLM-powered analysis with reasoning capabilities |
| Settlement Friction | DFlow on-chain settlement on Solana |

---

## 3. Product Requirements

### 3.1 Functional Requirements

#### 3.1.1 User Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| UM-01 | User registration with email | P0 | ✅ Done |
| UM-02 | Vanity wallet generation (gam... prefix) | P0 | ✅ Done |
| UM-03 | Session-based authentication | P0 | ✅ Done |
| UM-04 | External wallet auto-registration | P0 | ✅ Done |
| UM-05 | Multi-device session support | P1 | 🔲 Planned |
| UM-06 | 2FA authentication | P1 | 🔲 Planned |

#### 3.1.2 Wallet Operations

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| WO-01 | SOL/USDC balance checking | P0 | ✅ Done |
| WO-02 | Deposit address generation | P0 | ✅ Done |
| WO-03 | Withdrawal to external wallet | P0 | ✅ Done |
| WO-04 | Kalshi funding (USDC deposit) | P0 | ✅ Done |
| WO-05 | Transaction history | P0 | ✅ Done |
| WO-06 | Multi-token support | P1 | 🔲 Planned |

#### 3.1.3 Market Discovery

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| MD-01 | List active Kalshi markets | P0 | ✅ Done |
| MD-02 | Market detail retrieval | P0 | ✅ Done |
| MD-03 | Order book access | P0 | ✅ Done |
| MD-04 | Price history | P0 | ✅ Done |
| MD-05 | Market search/filtering | P1 | ✅ Done |
| MD-06 | Market recommendations | P1 | ✅ Done |

#### 3.1.4 Trading Execution

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| TE-01 | Quote retrieval via DFlow | P0 | ✅ Done |
| TE-02 | Trade execution | P0 | ✅ Done |
| TE-03 | Order status monitoring | P0 | ✅ Done |
| TE-04 | Position tracking | P0 | ✅ Done |
| TE-05 | Slippage protection | P0 | ✅ Done |
| TE-06 | Limit orders | P1 | 🔲 Planned |
| TE-07 | Stop-loss orders | P1 | 🔲 Planned |

#### 3.1.5 Risk Management

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| RM-01 | VaR calculation (95%, 99%) | P0 | ✅ Done |
| RM-02 | CVaR (Expected Shortfall) | P0 | ✅ Done |
| RM-03 | Kelly Criterion position sizing | P0 | ✅ Done |
| RM-04 | Portfolio risk assessment | P0 | ✅ Done |
| RM-05 | Concentration risk alerts | P1 | ✅ Done |
| RM-06 | Drawdown limits | P1 | 🔲 Planned |

#### 3.1.6 Intelligence & Analysis

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| IA-01 | News search and aggregation | P0 | ✅ Done |
| IA-02 | Sentiment analysis | P0 | ✅ Done |
| IA-03 | Market intelligence signals | P0 | ✅ Done |
| IA-04 | Web scraping (Firecrawl) | P0 | ✅ Done |
| IA-05 | Multi-market scanning | P1 | ✅ Done |
| IA-06 | Social media monitoring | P2 | 🔲 Planned |

#### 3.1.7 Quantitative Methods

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| QM-01 | Monte Carlo simulation | P0 | ✅ Done |
| QM-02 | Hidden Markov Model | P0 | ✅ Done |
| QM-03 | Regime detection | P0 | ✅ Done |
| QM-04 | Stress testing (6 scenarios) | P0 | ✅ Done |
| QM-05 | Sharpe ratio calculation | P0 | ✅ Done |
| QM-06 | Custom scenario builder | P2 | 🔲 Planned |

#### 3.1.8 Continuous Learning

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| CL-01 | 24/7 learning daemon | P0 | ✅ Done |
| CL-02 | HMM retraining (6h interval) | P0 | ✅ Done |
| CL-03 | Regime recalibration (1h) | P0 | ✅ Done |
| CL-04 | Kelly recalibration (30m) | P0 | ✅ Done |
| CL-05 | Self-healing agent | P1 | ✅ Done |
| CL-06 | Vulnerability detection | P1 | ✅ Done |


### 3.2 Non-Functional Requirements

#### 3.2.1 Performance

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| PF-01 | API response time | < 200ms | ✅ Met |
| PF-02 | Trade execution latency | < 2s | ✅ Met |
| PF-03 | Monte Carlo simulation | < 5s (10k iterations) | ✅ Met |
| PF-04 | News analysis workflow | < 30s | ✅ Met |
| PF-05 | Concurrent users | 1000+ | 🔲 Testing |

#### 3.2.2 Reliability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| RL-01 | System uptime | 99.9% | 🔲 Monitoring |
| RL-02 | Message delivery (Kafka) | At-least-once | ✅ Met |
| RL-03 | Dead letter queue | Auto-retry 3x | ✅ Met |
| RL-04 | Health monitoring | 60s intervals | ✅ Met |
| RL-05 | Graceful degradation | Fallback models | ✅ Met |

#### 3.2.3 Security

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| SC-01 | Private key encryption | AES-256 | ✅ Done |
| SC-02 | Session management | JWT + expiry | ✅ Done |
| SC-03 | API key protection | Environment vars | ✅ Done |
| SC-04 | Row Level Security | Supabase RLS | ✅ Done |
| SC-05 | Rate limiting | Per-user limits | 🔲 Planned |
| SC-06 | Audit logging | All transactions | 🔲 Planned |

#### 3.2.4 Scalability

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| SL-01 | Horizontal agent scaling | Kafka partitions | ✅ Done |
| SL-02 | Database scaling | Supabase managed | ✅ Done |
| SL-03 | Multi-region support | Future | 🔲 Planned |
| SL-04 | Load balancing | Docker Compose | ✅ Done |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│                    (Chat Interface / API / MCP Client)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HTTP API LAYER                                  │
│                           (Express.js :3000)                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    Auth      │  │    Chat      │  │   Wallet     │  │   Markets    │    │
│  │  Endpoints   │  │  Endpoints   │  │  Endpoints   │  │  Endpoints   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE BROKER (KAFKA)                             │
│                                                                              │
│  Topics: requests | wallet | trading | risk | simulation | analytics |       │
│          intelligence | solana | market-discovery | responses | dlq          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT ORCHESTRATION LAYER                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         ORCHESTRATOR                                │    │
│  │              (Router + Dispatcher + Synthesizer)                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│       ┌──────────┬──────────┬────────┴────────┬──────────┬──────────┐       │
│       ▼          ▼          ▼                 ▼          ▼          ▼       │
│  ┌────────┐ ┌────────┐ ┌────────┐       ┌────────┐ ┌────────┐ ┌────────┐   │
│  │ Wallet │ │Trading │ │  Risk  │       │Simulat.│ │ Intel. │ │ Solana │   │
│  │ Agent  │ │ Agent  │ │ Agent  │       │ Agent  │ │ Agent  │ │ Agent  │   │
│  └────────┘ └────────┘ └────────┘       └────────┘ └────────┘ └────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUANTITATIVE ENGINE                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │     HMM      │  │   Regime     │  │    Kelly     │  │ Monte Carlo  │    │
│  │   Trainer    │  │  Detector    │  │  Criterion   │  │  Simulator   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LEARNING DAEMON (24/7)                              │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Continuous Trainer          │  Self-Healing Agent                   │   │
│  │  • HMM (6h)                  │  • Code Review                        │   │
│  │  • Regime (1h)               │  • Vulnerability Detection            │   │
│  │  • Kelly (30m)               │  • Auto-Fix                           │   │
│  │  • Monte Carlo (15m)         │  • Logging                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL INTEGRATIONS                               │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Kalshi     │  │    DFlow     │  │  OpenRouter  │  │  Firecrawl   │    │
│  │     API      │  │  Trade API   │  │   (LLMs)     │  │  (Scraping)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │   Solana     │  │   Supabase   │  │  LangSmith   │                      │
│  │     RPC      │  │   (Storage)  │  │  (Tracing)   │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Hierarchy

```
                              ORCHESTRATOR
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                 │
           ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
           │ EXECUTION │     │ ANALYSIS  │     │ LEARNING  │
           │   TIER    │     │   TIER    │     │   TIER    │
           └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
                 │                 │                 │
        ┌────────┼────────┐       │           ┌─────┴─────┐
        │        │        │       │           │           │
     Wallet  Trading  Solana   ┌──┴──┐     Daemon    Self-Heal
                               │     │
                          Analytics  │
                                     │
                              ┌──────┼──────┐
                              │      │      │
                           Intel.  Risk  Simulation
```

### 4.3 Data Flow

```
User Request → API → Kafka → Orchestrator → Agents → External APIs
                                   │
                                   ▼
                              Supabase (Persistence)
                                   │
                                   ▼
                              Response → User
```

---

## 5. Feature Specifications

### 5.1 Vanity Wallet System

**Purpose**: Generate unique, branded wallet addresses for each user.

**Specification**:
- Prefix: `gam` (case-insensitive)
- Generation: Parallel keypair mining
- Storage: Encrypted private key in Supabase
- Auto-registration: External wallet captured from first deposit

**User Flow**:
```
1. User logs in
2. System generates vanity wallet (gam...)
3. User deposits SOL/USDC to agent wallet
4. System auto-registers sender as external wallet
5. User can withdraw via "pay me back" command
```

### 5.2 Multi-Agent Orchestration

**Purpose**: Route user requests to appropriate specialized agents.

**Specification**:
- Router: GPT-4o-mini for intent classification
- Dispatch: Parallel Kafka message publishing
- Aggregation: Wait for all responses (30s timeout)
- Synthesis: Combine results into coherent response

**Routing Rules**:
| Intent | Agents |
|--------|--------|
| Balance/Withdraw | wallet |
| Trade/Buy/Sell | wallet, trading, risk |
| Analyze/News | intelligence, analytics |
| Simulate/Risk | simulation, risk |
| Swap/Transfer | solana |

### 5.3 Quantitative Methods

#### 5.3.1 Hidden Markov Model (HMM)

**Purpose**: Detect hidden market regimes from observable price data.

**Specification**:
- States: 3 (BULL, SIDEWAYS, BEAR)
- Training: Baum-Welch algorithm
- Inference: Viterbi decoding
- Retraining: Every 6 hours

#### 5.3.2 Regime Detection

**Purpose**: Classify current market conditions for strategy selection.

**Specification**:
- Inputs: HMM probabilities, volatility, trend strength
- Outputs: RISK_ON, NEUTRAL, RISK_OFF
- Strategy mapping:
  - RISK_ON → Trend Following (Kelly 1.0x)
  - NEUTRAL → Mean Reversion (Kelly 0.5x)
  - RISK_OFF → Defensive (Kelly 0.25x)

#### 5.3.3 Kelly Criterion

**Purpose**: Optimal position sizing based on edge and probability.

**Formula**: `f* = (p × b - q) / b`

**Adjustments**:
- Regime multiplier (0.25x - 1.0x)
- Volatility adjustment
- Half-Kelly for conservative sizing
- Max position cap (25%)

#### 5.3.4 Monte Carlo Simulation

**Purpose**: Risk analysis through probabilistic scenario modeling.

**Specification**:
- Model: Geometric Brownian Motion (GBM)
- Iterations: 10,000 default
- Time steps: 252 (trading days)
- Outputs: VaR, CVaR, Sharpe, Win Rate, Max Drawdown

### 5.4 Intelligence System

**Purpose**: Gather and analyze market-relevant information.

**Components**:
1. **News Scraper**: Google News RSS aggregation
2. **Firecrawl**: Professional web scraping with JS rendering
3. **Sentiment Analyzer**: LLM-powered sentiment classification
4. **Signal Generator**: Combined news + liquidity + sentiment

**Signal Weights**:
- Sentiment: 60%
- Liquidity: 20%
- Spread: 20%

### 5.5 Multi-LLM System

**Purpose**: Task-optimized model selection with automatic fallbacks.

**Models**:
| Task | Primary | Fallback |
|------|---------|----------|
| Reasoning | DeepSeek V3.2 | Nemotron 3 |
| Analysis | GPT-4o | Gemini Pro |
| Sentiment | Claude Sonnet 4 | DeepSeek V3 |
| Code | Devstral | DeepSeek NEX |

**Features**:
- Reasoning chain preservation
- Automatic fallback on failure
- Usage tracking and cost optimization

### 5.6 Continuous Learning Daemon

**Purpose**: 24/7 model retraining and system self-improvement.

**Schedule**:
| Component | Interval | Purpose |
|-----------|----------|---------|
| HMM | 6 hours | Regime state estimation |
| Regime Detector | 1 hour | Market condition classification |
| Kelly Calibrator | 30 minutes | Position sizing optimization |
| Monte Carlo | 15 minutes | Risk metric updates |
| Self-Healing | Continuous | Vulnerability detection/fix |

---

## 6. API Specification

### 6.1 Authentication

```
POST /auth/login
Request: { userId: string, email: string }
Response: { sessionId: string, wallet: { address: string } }

GET /auth/me
Headers: X-Session-Id: <sessionId>
Response: { userId: string, wallet: { address: string, balance: object } }
```

### 6.2 Wallet

```
GET /wallet/balance
Response: { sol: number, usdc: number }

GET /wallet/deposit-address
Response: { address: string, instructions: string[] }

POST /wallet/withdraw
Request: { amount: number, token: "SOL" | "USDC" }
Response: { signature: string, to: string }

GET /wallet/transactions
Response: { transactions: Transaction[] }
```

### 6.3 Chat

```
POST /api/chat
Request: { query: string }
Response: { response: string, agents: string[], metadata: object }
```

### 6.4 Markets

```
GET /markets
Response: { markets: Market[] }

GET /markets/:ticker
Response: { market: Market, orderbook: Orderbook }

GET /markets/:ticker/history
Response: { history: PricePoint[] }
```

---

## 7. Integration Specifications

### 7.1 Kalshi API

**Base URL**: `https://api.kalshi.com/trade-api/v2`

**Authentication**: RSA signature with private key

**Endpoints Used**:
- `GET /markets` - List markets
- `GET /markets/{ticker}` - Market details
- `GET /markets/{ticker}/orderbook` - Order book
- `GET /markets/{ticker}/history` - Price history

### 7.2 DFlow Trade API

**Base URL**: `https://quote-api.dflow.net`

**Authentication**: `x-api-key` header

**Endpoints Used**:
- `GET /order` - Get quote + transaction
- `GET /quote` - Price quote only
- `GET /order-status` - Poll async order status

**Execution Modes**:
- Sync: Atomic single transaction
- Async: Multi-transaction with polling

### 7.3 OpenRouter API

**Base URL**: `https://openrouter.ai/api/v1`

**Authentication**: Bearer token

**Features**:
- Multi-model access
- Reasoning mode with `reasoning_details`
- Automatic model fallbacks

### 7.4 Firecrawl API

**Base URL**: `https://api.firecrawl.dev`

**Authentication**: Bearer token

**Features**:
- Professional web scraping
- JavaScript rendering
- Structured data extraction

---

## 8. Security Requirements

### 8.1 Key Management

| Asset | Protection | Storage |
|-------|------------|---------|
| User Private Keys | AES-256 encryption | Supabase (encrypted column) |
| API Keys | Environment variables | .env file (gitignored) |
| Session Tokens | JWT with expiry | Memory + Supabase |

### 8.2 Access Control

- Row Level Security (RLS) on all user tables
- Session-based authentication
- Per-user wallet isolation
- External wallet verification

### 8.3 Audit Trail

- All transactions logged to Supabase
- Agent actions tracked with correlation IDs
- Vulnerability findings stored and tracked

---

## 9. Deployment

### 9.1 Infrastructure

```yaml
Services:
  - API Server (Node.js)
  - Kafka Cluster (3 brokers)
  - Zookeeper
  - Agent Workers (8 instances)
  - Learning Daemon
  - Health Monitor
  - DLQ Processor

Storage:
  - Supabase (PostgreSQL)
  - Kafka (message persistence)

External:
  - Solana RPC
  - Kalshi API
  - DFlow API
  - OpenRouter API
  - Firecrawl API
```

### 9.2 Docker Compose

```yaml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
  kafka:
    image: confluentinc/cp-kafka:latest
  api:
    build: .
    command: npm run start:api
  orchestrator:
    build: .
    command: npm run start:orchestrator
  # ... additional workers
```

### 9.3 Environment Variables

```env
# Required
OPENROUTER_API_KEY=
SOLANA_RPC_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
KAFKA_BROKERS=
KALSHI_API_KEY=
KALSHI_PRIVATE_KEY=
DFLOW_API_KEY=

# Optional
FIRECRAWL_API_KEY=
LANGSMITH_API_KEY=
```

---

## 10. Roadmap

### Phase 1: Foundation (Complete ✅)

- [x] Multi-agent architecture
- [x] Kafka message broker
- [x] Vanity wallet system
- [x] Basic trading execution
- [x] Risk management (VaR, Kelly)
- [x] Monte Carlo simulation

### Phase 2: Intelligence (Complete ✅)

- [x] News scraping
- [x] Sentiment analysis
- [x] Firecrawl integration
- [x] LangGraph workflows
- [x] Multi-LLM system
- [x] LangSmith Studio

### Phase 3: Learning (Complete ✅)

- [x] Continuous learning daemon
- [x] HMM training
- [x] Regime detection
- [x] Self-healing agent
- [x] DFlow Trade API integration

### Phase 4: Production (In Progress 🔄)

- [ ] Rate limiting
- [ ] Audit logging
- [ ] Multi-region deployment
- [ ] Advanced order types (limit, stop-loss)
- [ ] Social media monitoring
- [ ] Mobile app

### Phase 5: Scale (Planned 📋)

- [ ] Institutional API
- [ ] Custom strategy builder
- [ ] Backtesting engine
- [ ] Portfolio optimization
- [ ] Cross-market arbitrage

---

## 11. Success Metrics

### 11.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Uptime | 99.9% | Health checks |
| Trade Execution Success | 99% | Transaction logs |
| Model Accuracy | >60% | Backtesting |
| Response Time | <200ms | APM |

### 11.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active Users | 1000+ | Supabase |
| Daily Trades | 10,000+ | Transaction logs |
| User Retention | >50% | Analytics |
| Win Rate | >55% | Position tracking |

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition |
|------|------------|
| VaR | Value at Risk - potential loss at confidence level |
| CVaR | Conditional VaR - expected loss beyond VaR |
| Kelly Criterion | Optimal bet sizing formula |
| HMM | Hidden Markov Model - regime detection |
| GBM | Geometric Brownian Motion - price simulation |
| DFlow | On-chain order routing protocol |
| Kalshi | CFTC-regulated prediction market |

### 12.2 References

- [Kalshi API Documentation](https://trading-api.readme.io/)
- [DFlow Trade API](https://pond.dflow.net/quickstart)
- [OpenRouter API](https://openrouter.ai/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: Gambit Team*
