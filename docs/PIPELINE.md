# Gambit Agent Pipeline Architecture

Dokumentasi lengkap hierarki dan alur end-to-end sistem multi-agent Gambit.

## Arsitektur Tingkat Tinggi

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER REQUEST                                      │
│                        "Buy YES on election market for $100"                         │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   HTTP API :3000                                     │
│                              POST /api/chat { query }                                │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              KAFKA MESSAGE BROKER                                    │
│                           Topic: agent.requests                                      │
└─────────────────────────────────────────┬───────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  ORCHESTRATOR                                        │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                           ROUTER (GPT-4o-mini)                              │    │
│  │                                                                             │    │
│  │  Input: "Buy YES on election market for $100"                               │    │
│  │  Output: ["wallet", "trading", "risk"]                                      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                          │                                           │
│                    ┌─────────────────────┼─────────────────────┐                    │
│                    ▼                     ▼                     ▼                    │
│            agent.wallet          agent.trading           agent.risk                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│    WALLET AGENT     │     │   TRADING AGENT     │     │     RISK AGENT      │
│                     │     │                     │     │                     │
│  • check_balance    │     │  • get_quote        │     │  • calculate_risk   │
│  • withdraw_to_user │     │  • execute_trade    │     │  • position_size    │
│  • fund_kalshi      │     │                     │     │  • assess_portfolio │
└──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              RESPONSE SYNTHESIZER                                    │
│                                                                                      │
│  Aggregates results from all agents into coherent response                          │
│  Topic: agent.responses                                                             │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  USER RESPONSE  │
                              └─────────────────┘
```

## Hierarki Agent

```
                              ┌──────────────────┐
                              │   ORCHESTRATOR   │
                              │   (Coordinator)  │
                              └────────┬─────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────┐            ┌───────────────┐
│   TIER 1:     │            │   TIER 1:     │            │   TIER 1:     │
│   EXECUTION   │            │   ANALYSIS    │            │   LEARNING    │
├───────────────┤            ├───────────────┤            ├───────────────┤
│ • Trading     │            │ • Analytics   │            │ • Gambit      │
│ • Wallet      │            │ • Intelligence│            │   Daemon      │
│ • Solana      │            │ • Simulation  │            │ • Self-Heal   │
└───────┬───────┘            └───────┬───────┘            └───────┬───────┘
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐            ┌───────────────┐            ┌───────────────┐
│   TIER 2:     │            │   TIER 2:     │            │   TIER 2:     │
│   SUPPORT     │            │   QUANT       │            │   MODELS      │
├───────────────┤            ├───────────────┤            ├───────────────┤
│ • Market      │            │ • Risk        │            │ • HMM         │
│   Discovery   │            │ • Monte Carlo │            │ • Regime      │
│               │            │ • Kelly       │            │ • Kelly       │
└───────────────┘            └───────────────┘            └───────────────┘
```

## Kafka Topics & Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              KAFKA TOPIC TOPOLOGY                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘

                              agent.requests
                                    │
                                    ▼
                              ┌───────────┐
                              │Orchestrator│
                              └─────┬─────┘
                                    │
        ┌───────────┬───────────┬───┴───┬───────────┬───────────┬───────────┐
        ▼           ▼           ▼       ▼           ▼           ▼           ▼
   agent.wallet  agent.trading  agent.  agent.   agent.    agent.     agent.
                               market   analytics simulation  risk     solana
                              discovery
        │           │           │       │           │           │           │
        └───────────┴───────────┴───┬───┴───────────┴───────────┴───────────┘
                                    ▼
                              agent.responses
                                    │
                                    ▼
                              agent.dead-letter (on failure)
```

### Topic Definitions

| Topic | Purpose | Partitions |
|-------|---------|------------|
| `agent.requests` | Incoming user requests | 3 |
| `agent.wallet` | Wallet operations | 3 |
| `agent.trading` | Trade execution | 3 |
| `agent.market-discovery` | Market search | 3 |
| `agent.analytics` | Market analysis | 3 |
| `agent.simulation` | Monte Carlo sims | 3 |
| `agent.risk` | Risk calculations | 3 |
| `agent.solana` | On-chain ops | 3 |
| `agent.intelligence` | News & sentiment | 3 |
| `agent.search` | Search operations | 3 |
| `agent.responses` | Agent responses | 3 |
| `agent.dead-letter` | Failed messages | 3 |
| `agent.health` | Health checks | 1 |
| `market.data` | Real-time market data (WebSocket) | 3 |


## Agent Detail

### 1. Orchestrator (Coordinator)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  ORCHESTRATOR                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  STEP 1: ROUTING                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Router Model: GPT-4o-mini                                                  │    │
│  │                                                                             │    │
│  │  Input:  User query                                                         │    │
│  │  Output: Array of agent names ["wallet", "trading", "risk"]                 │    │
│  │                                                                             │    │
│  │  Routing Logic:                                                             │    │
│  │  • "withdraw" / "repay" / "balance" → wallet                                │    │
│  │  • "buy" / "sell" / "trade" → trading                                       │    │
│  │  • "risk" / "VaR" / "position size" → risk                                  │    │
│  │  • "simulate" / "monte carlo" → simulation                                  │    │
│  │  • "news" / "sentiment" → intelligence                                      │    │
│  │  • "swap" / "stake" / "transfer" → solana                                   │    │
│  │  • "find market" / "list markets" → market_discovery                        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  STEP 2: PARALLEL DISPATCH                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  For each selected agent:                                                   │    │
│  │    1. Create TaskRequest with correlationId                                 │    │
│  │    2. Publish to agent's Kafka topic                                        │    │
│  │    3. Track pending request                                                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  STEP 3: RESPONSE AGGREGATION                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  • Wait for all agent responses (30s timeout)                               │    │
│  │  • Collect results by correlationId                                         │    │
│  │  • Synthesize into coherent response                                        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Execution Agents

#### Trading Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 TRADING AGENT                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: Execute trades via DFlow routing infrastructure                            │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  get_quote                                                                  │    │
│  │  ├── Input: { market, side, amount }                                        │    │
│  │  └── Output: { price, fee, slippage }                                       │    │
│  │                                                                             │    │
│  │  execute_trade                                                              │    │
│  │  ├── Input: { market, side, amount, maxSlippage }                           │    │
│  │  └── Output: { txHash, executedPrice, fee }                                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Flow:                                                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐           │
│  │ Request │───▶│  Quote  │───▶│  Risk   │───▶│ Execute │───▶│ Confirm │           │
│  └─────────┘    └─────────┘    │  Check  │    └─────────┘    └─────────┘           │
│                                └─────────┘                                          │
│                                                                                      │
│  External APIs:                                                                      │
│  • Kalshi API (market data, orderbook)                                              │
│  • DFlow Trade API (execution, settlement)                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Wallet Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  WALLET AGENT                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: Manage deposits, withdrawals, and balances                                 │
│                                                                                      │
│  Known Addresses (per user):                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  1. Agent Wallet (gam... vanity address) - User's trading wallet            │    │
│  │  2. External Wallet - Auto-registered from first deposit                    │    │
│  │  3. Kalshi Deposit Address - For funding trades                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  check_balance        → Get SOL/USDC balances                               │    │
│  │  get_deposit_address  → Get agent wallet for deposits                       │    │
│  │  withdraw_to_user     → Send funds to external wallet                       │    │
│  │  fund_kalshi          → Deposit USDC to Kalshi                              │    │
│  │  get_transaction_history → List past transactions                           │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  User Flow:                                                                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                          │
│  │ Deposit │───▶│ Register│───▶│  Trade  │───▶│Withdraw │                          │
│  │ to Agent│    │External │    │         │    │"Pay me  │                          │
│  │ Wallet  │    │ Wallet  │    │         │    │ back"   │                          │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Solana Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  SOLANA AGENT                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: Execute on-chain Solana operations                                         │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  swap_tokens     → Swap via DFlow/Jupiter                                   │    │
│  │  transfer_sol    → Send SOL to address                                      │    │
│  │  transfer_token  → Send SPL tokens                                          │    │
│  │  stake_sol       → Stake SOL to validator                                   │    │
│  │  get_balance     → Check wallet balance                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  DFlow Integration:                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                          │
│  │ Request │───▶│  Quote  │───▶│  Sign   │───▶│ Monitor │                          │
│  │  Order  │    │   +Tx   │    │ Submit  │    │ Status  │                          │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘                          │
│                                                                                      │
│  Execution Modes:                                                                    │
│  • Sync: Atomic single-transaction (instant)                                        │
│  • Async: Multi-transaction (poll /order-status)                                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Analysis Agents

#### Intelligence Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               INTELLIGENCE AGENT                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: News scraping, sentiment analysis, market intelligence                     │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  search_news           → Search Google News RSS                             │    │
│  │  fetch_article         → Extract article content                            │    │
│  │  analyze_sentiment     → LLM-powered sentiment                              │    │
│  │  get_market_intelligence → Combined news + liquidity + sentiment            │    │
│  │  web_browse            → Firecrawl web scraping                             │    │
│  │  run_news_workflow     → LangGraph news pipeline                            │    │
│  │  run_market_workflow   → LangGraph market intel pipeline                    │    │
│  │  scan_markets_workflow → Multi-market opportunity scan                      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  LangGraph Workflows:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  news_analysis:                                                             │    │
│  │  search → scrape → analyze → aggregate → summarize                          │    │
│  │                                                                             │    │
│  │  market_intel:                                                              │    │
│  │  fetchMarket → fetchNews → analyze → generateSignal                         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Signal Generation:                                                                  │
│  • Sentiment Score (60%)                                                            │
│  • Liquidity Score (20%)                                                            │
│  • Spread Score (20%)                                                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Risk Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   RISK AGENT                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: Risk metrics, position sizing, portfolio assessment                        │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  calculate_risk_metrics                                                     │    │
│  │  ├── Runs Monte Carlo simulation                                            │    │
│  │  ├── Calculates VaR 95%, VaR 99%, CVaR                                      │    │
│  │  └── Stores metrics to Supabase                                             │    │
│  │                                                                             │    │
│  │  calculate_position_size                                                    │    │
│  │  ├── Kelly Criterion calculation                                            │    │
│  │  ├── Risk-based sizing                                                      │    │
│  │  └── Half-Kelly conservative recommendation                                 │    │
│  │                                                                             │    │
│  │  assess_portfolio_risk                                                      │    │
│  │  ├── Leverage ratio                                                         │    │
│  │  ├── Concentration risk                                                     │    │
│  │  ├── Directional bias                                                       │    │
│  │  └── Risk score (0-100)                                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Risk Levels:                                                                        │
│  • LOW: Score < 30                                                                  │
│  • MEDIUM: Score 30-60                                                              │
│  • HIGH: Score > 60                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Simulation Agent
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                SIMULATION AGENT                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Purpose: Monte Carlo simulations and stress testing                                 │
│                                                                                      │
│  Tools:                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  run_monte_carlo                                                            │    │
│  │  ├── GBM price path simulation                                              │    │
│  │  ├── 10,000 iterations default                                              │    │
│  │  └── Output: VaR, CVaR, Sharpe, Win Rate                                    │    │
│  │                                                                             │    │
│  │  run_stress_test                                                            │    │
│  │  ├── 6 predefined scenarios                                                 │    │
│  │  └── Custom scenario support                                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Stress Test Scenarios:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  1. MARKET_CRASH      → -30% price shock                                    │    │
│  │  2. VOLATILITY_SPIKE  → 3x volatility                                       │    │
│  │  3. LIQUIDITY_CRISIS  → 50% liquidity drop                                  │    │
│  │  4. BLACK_SWAN        → -50% price, 5x volatility                           │    │
│  │  5. GRADUAL_DECLINE   → -20% over time                                      │    │
│  │  6. FLASH_CRASH       → -40% instant, 80% recovery                          │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```


### 4. Learning System (Gambit Daemon)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              GAMBIT LEARNING DAEMON                                  │
│                         (24/7 Continuous Learning System)                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         CONTINUOUS TRAINER                                  │    │
│  │                                                                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │    │
│  │  │ HMM Trainer │  │   Regime    │  │    Kelly    │  │ Monte Carlo │        │    │
│  │  │  (6 hours)  │  │  Detector   │  │ Calibrator  │  │  Simulator  │        │    │
│  │  │             │  │  (1 hour)   │  │ (30 mins)   │  │  (15 mins)  │        │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │    │
│  │         │                │                │                │               │    │
│  │         └────────────────┴────────────────┴────────────────┘               │    │
│  │                                   │                                        │    │
│  │                                   ▼                                        │    │
│  │                        ┌─────────────────────┐                             │    │
│  │                        │  Model Persistence  │                             │    │
│  │                        │     (Supabase)      │                             │    │
│  │                        └─────────────────────┘                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         SELF-HEALING AGENT                                  │    │
│  │                                                                             │    │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │    │
│  │  │    Code     │───▶│   Vuln      │───▶│   Auto      │───▶│   Apply     │  │    │
│  │  │   Review    │    │   Logger    │    │   Fixer     │    │    Fix      │  │    │
│  │  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │    │
│  │                                                                             │    │
│  │  Vulnerability Categories:                                                  │    │
│  │  • SECURITY: Injection, auth bypass, key exposure                          │    │
│  │  • LOGIC: Race conditions, edge cases                                      │    │
│  │  • PERFORMANCE: Memory leaks, N+1 queries                                  │    │
│  │  • RELIABILITY: Missing error handling                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Training Schedule:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  00:00  06:00  12:00  18:00  24:00                                          │    │
│  │    │     │      │      │      │                                             │    │
│  │    ├─────┼──────┼──────┼──────┤  HMM (every 6h)                             │    │
│  │    ├──┬──┼──┬───┼──┬───┼──┬───┤  Regime (every 1h)                          │    │
│  │    ├┬┬┼┬┬┼┬┬┼┬┬┬┼┬┬┼┬┬┬┼┬┬┼┬┬┬┤  Kelly (every 30m)                          │    │
│  │    ││││││││││││││││││││││││││││  Monte Carlo (every 15m)                    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Quantitative Models

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              QUANTITATIVE PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                      HIDDEN MARKOV MODEL (HMM)                              │    │
│  │                                                                             │    │
│  │  Hidden States: BULL (0) ─── SIDEWAYS (1) ─── BEAR (2)                      │    │
│  │                                                                             │    │
│  │  Training: Baum-Welch algorithm on historical returns                       │    │
│  │  Inference: Viterbi decoding for state sequence                             │    │
│  │                                                                             │    │
│  │  Output: Current regime probability distribution                            │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                        REGIME DETECTOR                                      │    │
│  │                                                                             │    │
│  │  Inputs:                                                                    │    │
│  │  • HMM state probabilities                                                  │    │
│  │  • Volatility analysis (rolling std)                                        │    │
│  │  • Trend strength (momentum)                                                │    │
│  │                                                                             │    │
│  │  Output Regimes:                                                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │    │
│  │  │  RISK_ON    │  │   NEUTRAL   │  │  RISK_OFF   │                         │    │
│  │  │ Kelly: 1.0x │  │ Kelly: 0.5x │  │ Kelly: 0.25x│                         │    │
│  │  │ Strategy:   │  │ Strategy:   │  │ Strategy:   │                         │    │
│  │  │ TREND_FOLLOW│  │ MEAN_REVERT │  │ DEFENSIVE   │                         │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                        KELLY CRITERION                                      │    │
│  │                                                                             │    │
│  │  Formula: f* = (p × b - q) / b                                              │    │
│  │                                                                             │    │
│  │  Where:                                                                     │    │
│  │  • p = probability of winning                                               │    │
│  │  • q = probability of losing (1 - p)                                        │    │
│  │  • b = odds (payout ratio)                                                  │    │
│  │                                                                             │    │
│  │  Adjustments:                                                               │    │
│  │  • Regime multiplier (0.25x - 1.0x)                                         │    │
│  │  • Volatility adjustment                                                    │    │
│  │  • Half-Kelly for conservative sizing                                       │    │
│  │  • Max position cap (25% of portfolio)                                      │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                      MONTE CARLO SIMULATOR                                  │    │
│  │                                                                             │    │
│  │  Model: Geometric Brownian Motion (GBM)                                     │    │
│  │  dS = μSdt + σSdW                                                           │    │
│  │                                                                             │    │
│  │  Parameters:                                                                │    │
│  │  • iterations: 10,000                                                       │    │
│  │  • timeSteps: 252 (trading days)                                            │    │
│  │  • dt: 1/252                                                                │    │
│  │                                                                             │    │
│  │  Outputs:                                                                   │    │
│  │  • VaR 95%, VaR 99%                                                         │    │
│  │  • CVaR (Expected Shortfall)                                                │    │
│  │  • Sharpe Ratio                                                             │    │
│  │  • Win Rate                                                                 │    │
│  │  • Max Drawdown                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## LangGraph Workflows

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LANGGRAPH WORKFLOWS                                     │
│                         (LangSmith Studio Compatible)                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  1. TRADING GRAPH                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │    │
│  │  │  Fetch    │───▶│  Detect   │───▶│   Run     │───▶│ Calculate │          │    │
│  │  │  Market   │    │  Regime   │    │Simulation │    │   Kelly   │          │    │
│  │  └───────────┘    └───────────┘    └───────────┘    └─────┬─────┘          │    │
│  │                                                           │                │    │
│  │                                                           ▼                │    │
│  │                                                    ┌───────────┐           │    │
│  │                                                    │   Make    │           │    │
│  │                                                    │ Decision  │           │    │
│  │                                                    └───────────┘           │    │
│  │                                                                             │    │
│  │  Input: { ticker, portfolioValue, riskTolerance }                           │    │
│  │  Output: { action: BUY|SELL|HOLD, side, size, confidence, reasoning }       │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  2. MARKET INTEL GRAPH                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │    │
│  │  │  Fetch    │───▶│  Fetch    │───▶│  Analyze  │───▶│ Generate  │          │    │
│  │  │  Market   │    │   News    │    │           │    │  Signal   │          │    │
│  │  └───────────┘    └───────────┘    └───────────┘    └───────────┘          │    │
│  │                                                                             │    │
│  │  Input: { ticker }                                                          │    │
│  │  Output: { sentiment, signal, keyFactors, liquidity }                       │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  3. NEWS ANALYSIS GRAPH                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐                           │    │
│  │  │  Search   │───▶│  Scrape   │───▶│  Analyze  │                           │    │
│  │  │   News    │    │ Articles  │    │           │                           │    │
│  │  └───────────┘    └───────────┘    └───────────┘                           │    │
│  │                                                                             │    │
│  │  Input: { query }                                                           │    │
│  │  Output: { sentiment, summary, articles }                                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  4. DFLOW SWAP GRAPH                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │    │
│  │  │   Get     │───▶│  Analyze  │───▶│ Recommend │───▶│  Execute  │          │    │
│  │  │  Quote    │    │   Price   │    │           │    │   Swap    │          │    │
│  │  └───────────┘    └───────────┘    └───────────┘    └───────────┘          │    │
│  │                                                                             │    │
│  │  Input: { inputToken, outputToken, amount, execute: bool }                  │    │
│  │  Output: { quote, priceAnalysis, recommendation, result }                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```


## Multi-LLM System

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MULTI-LLM ORCHESTRATOR                                  │
│                              (OpenRouter Integration)                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Task-Based Model Selection:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  Task Type          │  Primary Model           │  Fallback                  │    │
│  │  ──────────────────────────────────────────────────────────────────────────│    │
│  │  reasoning          │  DeepSeek V3.2           │  Nemotron 3 (free)         │    │
│  │  analysis           │  GPT-4o                  │  Gemini Pro                │    │
│  │  sentiment          │  Claude Sonnet 4         │  DeepSeek V3              │    │
│  │  code               │  Devstral (free)         │  DeepSeek NEX             │    │
│  │  default            │  DeepSeek V3             │  Devstral (free)          │    │
│  │                                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Reasoning Chain Flow:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐          │    │
│  │  │  Initial  │───▶│ Reasoning │───▶│ Follow-up │───▶│  Final    │          │    │
│  │  │  Prompt   │    │  Details  │    │ Questions │    │  Answer   │          │    │
│  │  └───────────┘    └───────────┘    └───────────┘    └───────────┘          │    │
│  │                                                                             │    │
│  │  reasoning_details preserved across turns for continuous reasoning          │    │
│  │                                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Automatic Fallback:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                             │    │
│  │  Premium Model ──(fail)──▶ Medium Tier ──(fail)──▶ Free Tier               │    │
│  │       │                        │                        │                   │    │
│  │   GPT-4o                  Gemini Pro              Devstral                  │    │
│  │   Claude                  DeepSeek V3             DeepSeek NEX              │    │
│  │                                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## End-to-End Trade Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE TRADE FLOW EXAMPLE                                │
│                    User: "Buy YES on PRES-2024 for $100"                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  STEP 1: REQUEST INGESTION                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  HTTP POST /api/chat                                                        │    │
│  │  → Validate session                                                         │    │
│  │  → Publish to Kafka: agent.requests                                         │    │
│  │  → correlationId: "abc-123"                                                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  STEP 2: ORCHESTRATOR ROUTING                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Router LLM analyzes query                                                  │    │
│  │  → Detects: trade intent, market ticker, amount                             │    │
│  │  → Routes to: ["wallet", "risk", "trading"]                                 │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                    ┌──────────────────┼──────────────────┐                          │
│                    ▼                  ▼                  ▼                          │
│  STEP 3: PARALLEL AGENT EXECUTION                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  WALLET AGENT   │  │   RISK AGENT    │  │  TRADING AGENT  │                      │
│  │                 │  │                 │  │                 │                      │
│  │  check_balance  │  │  position_size  │  │  get_quote      │                      │
│  │  → SOL: 2.5     │  │  → Kelly: 8%    │  │  → price: 0.65  │                      │
│  │  → USDC: 500    │  │  → max: $80     │  │  → fee: $0.10   │                      │
│  │                 │  │  → risk: LOW    │  │                 │                      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                      │
│           │                    │                    │                               │
│           └────────────────────┼────────────────────┘                               │
│                                ▼                                                    │
│  STEP 4: RESPONSE SYNTHESIS                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Synthesizer LLM combines results:                                          │    │
│  │                                                                             │    │
│  │  "You have sufficient balance (500 USDC). Based on Kelly Criterion,         │    │
│  │   recommended position is $80 (8% of portfolio). Current YES price          │    │
│  │   is $0.65. Shall I proceed with the trade?"                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  STEP 5: USER CONFIRMS → EXECUTE                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Trading Agent executes:                                                    │    │
│  │  1. Get fresh quote from DFlow                                              │    │
│  │  2. Sign transaction with user's agent wallet                               │    │
│  │  3. Submit to Solana                                                        │    │
│  │  4. Monitor order status (sync/async)                                       │    │
│  │  5. Return confirmation with txHash                                         │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                       │                                             │
│                                       ▼                                             │
│  STEP 6: BACKGROUND LEARNING                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  Gambit Daemon:                                                             │    │
│  │  • Store trade in Supabase                                                  │    │
│  │  • Update position tracking                                                 │    │
│  │  • Recalibrate Kelly with new data                                          │    │
│  │  • Update regime detection                                                  │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow & Storage

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW & PERSISTENCE                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                            SUPABASE TABLES                                  │    │
│  │                                                                             │    │
│  │  users                    │  wallets                  │  sessions           │    │
│  │  ├── id                   │  ├── user_id              │  ├── id             │    │
│  │  ├── email                │  ├── address (gam...)     │  ├── user_id        │    │
│  │  └── created_at           │  ├── encrypted_key        │  └── expires_at     │    │
│  │                           │  └── external_wallet      │                     │    │
│  │                                                                             │    │
│  │  transactions             │  positions                │  risk_metrics       │    │
│  │  ├── user_id              │  ├── user_id              │  ├── market_ticker  │    │
│  │  ├── tx_type              │  ├── market_ticker        │  ├── var_95         │    │
│  │  ├── amount               │  ├── side                 │  ├── var_99         │    │
│  │  ├── tx_signature         │  ├── quantity             │  ├── cvar_95        │    │
│  │  └── status               │  └── avg_price            │  └── sharpe_ratio   │    │
│  │                                                                             │    │
│  │  model_states             │  vulnerabilities          │  events             │    │
│  │  ├── model_type           │  ├── severity             │  ├── type           │    │
│  │  ├── state_data           │  ├── category             │  ├── component      │    │
│  │  ├── metrics              │  ├── description          │  ├── data           │    │
│  │  └── trained_at           │  └── status               │  └── created_at     │    │
│  │                                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Real-time Subscriptions:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  • positions → UI updates on trade execution                                │    │
│  │  • transactions → Wallet activity feed                                      │    │
│  │  • risk_metrics → Dashboard risk indicators                                 │    │
│  │  • events → System monitoring                                               │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## External API Integrations

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL API INTEGRATIONS                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  KALSHI API                                                                 │    │
│  │  Base URL: https://api.kalshi.com/trade-api/v2                              │    │
│  │                                                                             │    │
│  │  Endpoints:                                                                 │    │
│  │  • GET /markets → List prediction markets                                   │    │
│  │  • GET /markets/{ticker} → Market details                                   │    │
│  │  • GET /markets/{ticker}/orderbook → Order book                             │    │
│  │  • GET /markets/{ticker}/history → Price history                            │    │
│  │                                                                             │    │
│  │  Auth: RSA signature (KALSHI_PRIVATE_KEY)                                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  DFLOW TRADE API                                                            │    │
│  │  Base URL: https://quote-api.dflow.net                                      │    │
│  │                                                                             │    │
│  │  Endpoints:                                                                 │    │
│  │  • GET /order → Get quote + transaction                                     │    │
│  │  • GET /quote → Price quote only                                            │    │
│  │  • GET /order-status → Poll async order status                              │    │
│  │                                                                             │    │
│  │  Auth: x-api-key header (DFLOW_API_KEY)                                     │    │
│  │                                                                             │    │
│  │  Execution Modes:                                                           │    │
│  │  • sync → Atomic single transaction                                         │    │
│  │  • async → Multi-transaction with polling                                   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  OPENROUTER API                                                             │    │
│  │  Base URL: https://openrouter.ai/api/v1                                     │    │
│  │                                                                             │    │
│  │  Features:                                                                  │    │
│  │  • Multi-model access (OpenAI, Anthropic, Google, etc.)                     │    │
│  │  • Reasoning mode with reasoning_details                                    │    │
│  │  • Automatic fallbacks                                                      │    │
│  │                                                                             │    │
│  │  Auth: Bearer token (OPENROUTER_API_KEY)                                    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  KALSHI WEBSOCKET                                                           │    │
│  │  URL: wss://api.elections.kalshi.com/trade-api/ws/v2                        │    │
│  │                                                                             │    │
│  │  Channels:                                                                  │    │
│  │  • orderbook_delta → Real-time orderbook updates                            │    │
│  │  • ticker → Price/volume updates                                            │    │
│  │  • trade → Public trade feed                                                │    │
│  │  • fill → User's executed trades (authenticated)                            │    │
│  │                                                                             │    │
│  │  Auth: RSA-PSS signature in URL params                                      │    │
│  │  Auto-reconnect with exponential backoff                                    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  FIRECRAWL API                                                              │    │
│  │  Base URL: https://api.firecrawl.dev                                        │    │
│  │                                                                             │    │
│  │  Features:                                                                  │    │
│  │  • Professional web scraping                                                │    │
│  │  • Structured data extraction                                               │    │
│  │  • JavaScript rendering                                                     │    │
│  │                                                                             │    │
│  │  Auth: Bearer token (FIRECRAWL_API_KEY)                                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  SOLANA RPC                                                                 │    │
│  │  URL: Configurable (mainnet/devnet)                                         │    │
│  │                                                                             │    │
│  │  Operations:                                                                │    │
│  │  • getBalance → SOL balance                                                 │    │
│  │  • getTokenAccountsByOwner → SPL token balances                             │    │
│  │  • sendTransaction → Submit signed transactions                             │    │
│  │  • getSignatureStatuses → Confirm transactions                              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Startup Sequence

```bash
# 1. Infrastructure
docker-compose up -d  # Kafka + Zookeeper + Elasticsearch

# 2. Learning Daemon (background)
npm run start:daemon

# 3. API Server
npm run start:api

# 4. Orchestrator
npm run start:orchestrator

# 5. Agent Workers (parallel)
npm run start:wallet &
npm run start:trading &
npm run start:risk &
npm run start:simulation &
npm run start:analytics &
npm run start:intelligence &
npm run start:solana &
npm run start:market-discovery &

# 6. Data Stream Workers
npm run start:kalshi-stream &
npm run start:search-indexer &

# 7. Support Workers
npm run start:health &
npm run start:dlq &

# 8. LangGraph Studio (optional)
npm run langgraph:dev
```

## Monitoring & Health

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MONITORING ENDPOINTS                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Health Check: http://localhost:3001/health                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  {                                                                          │    │
│  │    "status": "healthy",                                                     │    │
│  │    "uptime": 3600,                                                          │    │
│  │    "agents": {                                                              │    │
│  │      "wallet": "running",                                                   │    │
│  │      "trading": "running",                                                  │    │
│  │      "risk": "running"                                                      │    │
│  │    },                                                                       │    │
│  │    "kafka": "connected",                                                    │    │
│  │    "supabase": "connected"                                                  │    │
│  │  }                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  Dead Letter Queue: http://localhost:3002/dlq                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  {                                                                          │    │
│  │    "pending": 0,                                                            │    │
│  │    "failed": [],                                                            │    │
│  │    "retryable": []                                                          │    │
│  │  }                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  LangSmith Studio: https://smith.langchain.com/studio?baseUrl=http://localhost:2024  │
│  • Visual graph debugging                                                            │
│  • Trace inspection                                                                  │
│  • Performance metrics                                                               │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

*Dokumentasi ini menggambarkan arsitektur lengkap sistem multi-agent Gambit untuk trading prediction market di Kalshi via DFlow.*
