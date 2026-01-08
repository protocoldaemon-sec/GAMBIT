/**
 * Session Management
 * Handles user authentication and session-to-wallet binding
 */
import { v4 as uuidv4 } from "uuid";
import { getOrCreateUserWallet, getUserKeypair } from "./user-wallet.js";

// In-memory session store (use Redis in production)
const sessions = new Map();

/**
 * Create a new session for user
 */
export async function createSession(userId, email = null) {
  const sessionId = uuidv4();
  
  // Get or create user's vanity wallet
  const wallet = await getOrCreateUserWallet(userId, email);
  
  const session = {
    sessionId,
    userId,
    publicKey: wallet.publicKey,
    isNewWallet: wallet.isNew,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };

  sessions.set(sessionId, session);

  console.log(`🔐 Session created: ${sessionId} -> ${wallet.publicKey}`);

  return {
    sessionId,
    publicKey: wallet.publicKey,
    isNewWallet: wallet.isNew,
  };
}

/**
 * Get session by ID
 */
export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
  return session;
}

/**
 * Get user's keypair for a session
 */
export async function getSessionKeypair(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  return await getUserKeypair(session.userId);
}

/**
 * Destroy session
 */
export function destroySession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > maxAgeMs) {
      sessions.delete(sessionId);
    }
  }
}

/**
 * Get all active sessions (admin)
 */
export function listSessions() {
  return Array.from(sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    userId: s.userId,
    publicKey: s.publicKey,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
  }));
}
