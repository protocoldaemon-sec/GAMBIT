-- Supabase Schema for Kalshi-DFlow MAS (Gambit)

-- ============================================
-- USER & WALLET TABLES
-- ============================================

-- User wallets (vanity addresses)
CREATE TABLE gambit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL UNIQUE,
  encrypted_secret TEXT NOT NULL, -- Encrypt with KMS in production!
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Users table
CREATE TABLE gambit_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  external_wallet TEXT, -- User's wallet for withdrawals (auto-registered from deposit)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SIMULATION TABLES
-- ============================================

-- Simulations table
CREATE TABLE simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id),
  type TEXT NOT NULL, -- 'monte_carlo', 'stress_test'
  market_ticker TEXT NOT NULL,
  config JSONB NOT NULL,
  status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
  summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Simulation results (individual iterations)
CREATE TABLE simulation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID REFERENCES simulations(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Risk metrics
CREATE TABLE risk_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id),
  market_ticker TEXT NOT NULL,
  var_95 DECIMAL,
  var_99 DECIMAL,
  cvar_95 DECIMAL,
  max_drawdown DECIMAL,
  sharpe_ratio DECIMAL,
  volatility DECIMAL,
  position_size DECIMAL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market snapshots for historical analysis
CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_ticker TEXT NOT NULL,
  yes_price DECIMAL NOT NULL,
  no_price DECIMAL NOT NULL,
  volume DECIMAL,
  open_interest DECIMAL,
  bid_ask_spread DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stress test scenarios
CREATE TABLE stress_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id UUID REFERENCES simulations(id) ON DELETE CASCADE,
  scenario_name TEXT NOT NULL,
  parameters JSONB NOT NULL,
  pnl_impact DECIMAL,
  max_loss DECIMAL,
  recovery_time INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSACTION HISTORY
-- ============================================

CREATE TABLE gambit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id),
  wallet_address TEXT NOT NULL,
  tx_signature TEXT UNIQUE,
  tx_type TEXT NOT NULL, -- 'swap', 'transfer', 'stake', 'trade'
  amount DECIMAL,
  token_mint TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- API KEYS
-- ============================================

CREATE TABLE gambit_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key ON gambit_api_keys(api_key);
CREATE INDEX idx_api_keys_user ON gambit_api_keys(user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_wallets_user_id ON gambit_wallets(user_id);
CREATE INDEX idx_wallets_public_key ON gambit_wallets(public_key);
CREATE INDEX idx_simulation_results_sim_id ON simulation_results(simulation_id);
CREATE INDEX idx_risk_metrics_ticker ON risk_metrics(market_ticker);
CREATE INDEX idx_risk_metrics_user ON risk_metrics(user_id);
CREATE INDEX idx_market_snapshots_ticker ON market_snapshots(market_ticker);
CREATE INDEX idx_stress_tests_sim_id ON stress_tests(simulation_id);
CREATE INDEX idx_transactions_user ON gambit_transactions(user_id);
CREATE INDEX idx_transactions_signature ON gambit_transactions(tx_signature);

-- ============================================
-- ENABLE REAL-TIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE simulations;
ALTER PUBLICATION supabase_realtime ADD TABLE simulation_results;
ALTER PUBLICATION supabase_realtime ADD TABLE risk_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE gambit_transactions;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE gambit_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gambit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON gambit_users
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Users can view own wallet" ON gambit_wallets
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can view own simulations" ON simulations
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can view own risk metrics" ON risk_metrics
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can view own transactions" ON gambit_transactions
  FOR SELECT USING (auth.uid()::text = user_id);


-- ============================================
-- GAMBIT SYSTEM TABLES
-- ============================================

-- Model versions for continuous learning
CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  hmm_params JSONB,
  regime_state JSONB,
  kelly_params JSONB,
  training_log JSONB,
  performance_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vulnerabilities log
CREATE TABLE vulnerabilities (
  id UUID PRIMARY KEY,
  severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  category TEXT NOT NULL, -- 'SECURITY', 'BUSINESS_LOGIC', 'RISK_MANAGEMENT', etc.
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  impact TEXT,
  recommendation TEXT,
  status TEXT DEFAULT 'OPEN', -- 'OPEN', 'FIXED', 'IGNORED'
  auto_fixable BOOLEAN DEFAULT FALSE,
  fix_priority INTEGER,
  fixed_at TIMESTAMPTZ,
  fix_details JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  component TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  vulnerability_id UUID REFERENCES vulnerabilities(id),
  status TEXT DEFAULT 'OPEN',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health checks
CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL,
  status TEXT NOT NULL, -- 'HEALTHY', 'DEGRADED', 'DOWN'
  details JSONB,
  issues TEXT[],
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Market data for regime detection
CREATE TABLE market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  price DECIMAL NOT NULL,
  volume DECIMAL,
  volatility DECIMAL,
  regime TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Positions
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL, -- 'yes', 'no'
  size DECIMAL NOT NULL,
  entry_price DECIMAL NOT NULL,
  current_price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  volatility DECIMAL,
  var_95 DECIMAL,
  var_99 DECIMAL,
  expected_pnl DECIMAL,
  win_probability DECIMAL,
  status TEXT DEFAULT 'open', -- 'open', 'closed', 'settled'
  pnl DECIMAL,
  last_simulation TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ
);

-- Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES gambit_users(id),
  position_id UUID REFERENCES positions(id),
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  price DECIMAL NOT NULL,
  fees DECIMAL,
  order_id TEXT,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'filled', 'settled', 'cancelled'
  pnl DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ
);

-- Regime history
CREATE TABLE regime_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT,
  regime TEXT NOT NULL, -- 'RISK_ON', 'NEUTRAL', 'RISK_OFF'
  hmm_state TEXT,
  volatility_regime TEXT,
  trend_regime TEXT,
  confidence DECIMAL,
  metrics JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GAMBIT INDEXES
-- ============================================

CREATE INDEX idx_model_versions_created ON model_versions(created_at DESC);
CREATE INDEX idx_vulnerabilities_status ON vulnerabilities(status);
CREATE INDEX idx_vulnerabilities_severity ON vulnerabilities(severity);
CREATE INDEX idx_vulnerabilities_category ON vulnerabilities(category);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created ON events(created_at DESC);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_health_checks_component ON health_checks(component);
CREATE INDEX idx_market_data_ticker ON market_data(ticker);
CREATE INDEX idx_market_data_timestamp ON market_data(timestamp DESC);
CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_trades_user ON trades(user_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_regime_history_timestamp ON regime_history(timestamp DESC);

-- ============================================
-- ENABLE REAL-TIME FOR GAMBIT
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE vulnerabilities;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE regime_history;


-- ============================================
-- INTELLIGENCE TABLES
-- ============================================

-- Market intelligence reports
CREATE TABLE market_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  market_title TEXT,
  yes_price DECIMAL,
  sentiment TEXT, -- 'BULLISH', 'BEARISH', 'NEUTRAL'
  sentiment_confidence DECIMAL,
  liquidity_score DECIMAL,
  signal_action TEXT, -- 'BUY', 'SELL', 'HOLD'
  signal_side TEXT, -- 'yes', 'no'
  signal_strength DECIMAL,
  article_count INTEGER,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News articles cache
CREATE TABLE news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  source TEXT,
  content TEXT,
  published_at TIMESTAMPTZ,
  sentiment TEXT,
  sentiment_score DECIMAL,
  related_tickers TEXT[],
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Intelligence scan history
CREATE TABLE intelligence_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type TEXT NOT NULL, -- 'MARKET', 'NEWS', 'FULL'
  tickers TEXT[],
  results JSONB,
  opportunities_found INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTELLIGENCE INDEXES
-- ============================================

CREATE INDEX idx_market_intel_ticker ON market_intelligence(ticker);
CREATE INDEX idx_market_intel_created ON market_intelligence(created_at DESC);
CREATE INDEX idx_market_intel_signal ON market_intelligence(signal_action);
CREATE INDEX idx_news_articles_url ON news_articles(url);
CREATE INDEX idx_news_articles_published ON news_articles(published_at DESC);
CREATE INDEX idx_intel_scans_created ON intelligence_scans(created_at DESC);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE market_intelligence;
