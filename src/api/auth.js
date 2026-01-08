/**
 * Authentication API
 * Handles user login, session management, and wallet binding
 */
import { v4 as uuidv4 } from "uuid";
import { createSession, getSession, destroySession, getSessionAgent } from "../auth/session.js";
import { getOrCreateUserWallet, getUserPublicKey } from "../auth/user-wallet.js";
import { getAgentBalance } from "../wallet/treasury.js";
import { supabase } from "../supabase/client.js";

/**
 * Login / Register user
 * Creates a new session and generates vanity wallet if needed
 */
export async function login(userId, email = null) {
  if (!userId) {
    throw new Error("userId is required");
  }

  // Create session with wallet
  const session = await createSession(userId, email);

  return {
    success: true,
    sessionId: session.sessionId,
    wallet: {
      address: session.publicKey,
      isNew: session.isNewWallet,
    },
    message: session.isNewWallet 
      ? `Welcome! Your Gambit wallet has been created: ${session.publicKey}`
      : `Welcome back! Your wallet: ${session.publicKey}`,
  };
}

/**
 * Logout user
 */
export async function logout(sessionId) {
  destroySession(sessionId);
  return { success: true, message: "Logged out successfully" };
}

/**
 * Validate session
 */
export async function validateSession(sessionId) {
  const session = getSession(sessionId);
  
  if (!session) {
    return { valid: false, error: "Session not found or expired" };
  }

  return {
    valid: true,
    userId: session.userId,
    publicKey: session.publicKey,
    createdAt: session.createdAt,
  };
}

/**
 * Get user info
 */
export async function getUserInfo(sessionId) {
  const session = getSession(sessionId);
  
  if (!session) {
    throw new Error("Session not found");
  }

  const balance = await getAgentBalance(session.userId);

  // Get user from Supabase
  let userData = null;
  if (supabase) {
    const { data } = await supabase
      .from("gambit_users")
      .select("*")
      .eq("id", session.userId)
      .single();
    userData = data;
  }

  return {
    userId: session.userId,
    email: userData?.email,
    wallet: {
      address: session.publicKey,
      balance: {
        sol: balance.sol,
        usdc: balance.usdc,
      },
    },
    externalWallet: userData?.external_wallet || null,
    createdAt: userData?.created_at,
  };
}

/**
 * Get deposit address for user
 */
export async function getDepositAddress(sessionId) {
  const session = getSession(sessionId);
  
  if (!session) {
    throw new Error("Session not found");
  }

  return {
    depositAddress: session.publicKey,
    instructions: [
      "Send SOL or USDC to this address",
      "Your sending wallet will be registered for withdrawals",
      "Funds will be available immediately after confirmation",
    ],
  };
}

/**
 * Middleware to extract session from request
 */
export function authMiddleware(req, res, next) {
  const sessionId = req.headers["x-session-id"] || req.query.sessionId;

  if (!sessionId) {
    return res.status(401).json({ error: "No session provided" });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.session = session;
  req.userId = session.userId;
  next();
}

/**
 * Generate API key for user (for programmatic access)
 */
export async function generateApiKey(userId) {
  const apiKey = `gam_${uuidv4().replace(/-/g, "")}`;
  
  if (supabase) {
    await supabase.from("gambit_api_keys").insert({
      user_id: userId,
      api_key: apiKey, // Hash in production!
      created_at: new Date().toISOString(),
    });
  }

  return { apiKey };
}

/**
 * Validate API key
 */
export async function validateApiKey(apiKey) {
  if (!supabase) return null;

  const { data } = await supabase
    .from("gambit_api_keys")
    .select("user_id, created_at")
    .eq("api_key", apiKey)
    .eq("revoked", false)
    .single();

  return data;
}
