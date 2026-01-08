# Gambit Setup Guide

## Prerequisites

- Node.js 18+
- Docker (for Kafka)
- Supabase account

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
OPENAI_API_KEY=sk-...
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
KAFKA_BROKERS=localhost:9092
```

## 3. Start Kafka

```bash
docker-compose up -d
```

## 4. Setup Supabase

Run `src/supabase/schema.sql` in Supabase SQL Editor.

## 5. Start Services

```bash
# Terminal 1: API Server
npm run start:api

# Terminal 2: Orchestrator
npm run start:orchestrator

# Terminal 3-9: Workers
npm run start:wallet
npm run start:trading
npm run start:simulation
npm run start:risk
npm run start:solana
npm run start:analytics
npm run start:market-discovery

# Terminal 10-11: Monitoring
npm run start:health
npm run start:dlq
```

## 6. Test

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "email": "test@example.com"}'

# Check balance
curl http://localhost:3000/wallet/balance \
  -H "X-Session-Id: <sessionId-from-login>"
```

## Project Structure

```
src/
├── agents/          # Agent definitions
├── api/             # HTTP API (auth, server)
├── auth/            # Session, vanity wallet
├── kafka/           # Kafka client & messages
├── simulation/      # Monte Carlo, stress tests
├── solana/          # Solana client (@solana/web3.js)
├── supabase/        # Database client & schema
├── utils/           # Retry, health, DLQ
├── wallet/          # Treasury management
└── workers/         # Kafka workers
```

## Reference

The `solana-agent-kit/` folder contains the Solana Agent Kit repository for reference and enrichment purposes only. It is not a dependency of Gambit.
