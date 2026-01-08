/**
 * Supabase Client for real-time data streaming
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Graceful handling when Supabase is not configured
const isSupabaseConfigured = supabaseUrl && supabaseKey && 
  supabaseUrl !== "https://your-project.supabase.co";

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Table names
export const TABLES = {
  SIMULATIONS: "simulations",
  SIMULATION_RESULTS: "simulation_results",
  RISK_METRICS: "risk_metrics",
  MARKET_SNAPSHOTS: "market_snapshots",
  STRESS_TESTS: "stress_tests",
};

// Real-time subscriptions
export function subscribeToSimulations(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  return supabase
    .channel("simulations")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLES.SIMULATIONS }, callback)
    .subscribe();
}

export function subscribeToRiskMetrics(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  return supabase
    .channel("risk_metrics")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLES.RISK_METRICS }, callback)
    .subscribe();
}

// Stream simulation results in real-time
export async function streamSimulationResult(simulationId, iteration, result) {
  if (!supabase) return { data: null, error: null };
  return supabase.from(TABLES.SIMULATION_RESULTS).insert({
    simulation_id: simulationId,
    iteration,
    result,
    created_at: new Date().toISOString(),
  });
}

// Store risk metrics
export async function storeRiskMetrics(metrics) {
  if (!supabase) return { data: null, error: null };
  return supabase.from(TABLES.RISK_METRICS).insert({
    ...metrics,
    created_at: new Date().toISOString(),
  });
}

// Store market snapshot
export async function storeMarketSnapshot(snapshot) {
  if (!supabase) return { data: null, error: null };
  return supabase.from(TABLES.MARKET_SNAPSHOTS).insert({
    ...snapshot,
    created_at: new Date().toISOString(),
  });
}
