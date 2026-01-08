/**
 * HTTP API Server
 * REST endpoints for Gambit
 */
import "dotenv/config";
import http from "http";
import { URL } from "url";
import { login, logout, validateSession, getUserInfo, getDepositAddress } from "./auth.js";
import { getAgentBalance, getTransactionHistory, withdrawSol, withdrawUsdc } from "../wallet/treasury.js";
import { getSession } from "../auth/session.js";

const PORT = process.env.API_PORT || 3000;

// Simple JSON body parser
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Get session from request
function getSessionFromReq(req) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  return req.headers["x-session-id"] || url.searchParams.get("sessionId");
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // ============ AUTH ROUTES ============
    
    // POST /auth/login
    if (req.method === "POST" && path === "/auth/login") {
      const body = await parseBody(req);
      const result = await login(body.userId, body.email);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // POST /auth/logout
    if (req.method === "POST" && path === "/auth/logout") {
      const sessionId = getSessionFromReq(req);
      const result = await logout(sessionId);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // GET /auth/session
    if (req.method === "GET" && path === "/auth/session") {
      const sessionId = getSessionFromReq(req);
      const result = await validateSession(sessionId);
      res.writeHead(result.valid ? 200 : 401);
      res.end(JSON.stringify(result));
      return;
    }

    // GET /auth/me
    if (req.method === "GET" && path === "/auth/me") {
      const sessionId = getSessionFromReq(req);
      const result = await getUserInfo(sessionId);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // ============ WALLET ROUTES ============

    // GET /wallet/balance
    if (req.method === "GET" && path === "/wallet/balance") {
      const sessionId = getSessionFromReq(req);
      const session = getSession(sessionId);
      if (!session) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      const balance = await getAgentBalance(session.userId);
      res.writeHead(200);
      res.end(JSON.stringify(balance));
      return;
    }

    // GET /wallet/deposit-address
    if (req.method === "GET" && path === "/wallet/deposit-address") {
      const sessionId = getSessionFromReq(req);
      const result = await getDepositAddress(sessionId);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    // POST /wallet/withdraw
    if (req.method === "POST" && path === "/wallet/withdraw") {
      const sessionId = getSessionFromReq(req);
      const session = getSession(sessionId);
      if (!session) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const body = await parseBody(req);
      let result;
      if (body.token === "SOL") {
        result = await withdrawSol(session.userId, body.amount);
      } else if (body.token === "USDC") {
        result = await withdrawUsdc(session.userId, body.amount);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid token. Use SOL or USDC" }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, ...result }));
      return;
    }

    // GET /wallet/transactions
    if (req.method === "GET" && path === "/wallet/transactions") {
      const sessionId = getSessionFromReq(req);
      const session = getSession(sessionId);
      if (!session) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const limit = parseInt(url.searchParams.get("limit") || "20");
      const transactions = await getTransactionHistory(session.userId, limit);
      res.writeHead(200);
      res.end(JSON.stringify({ transactions }));
      return;
    }

    // ============ HEALTH ============
    
    if (path === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      return;
    }

    // 404
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));

  } catch (error) {
    console.error("API Error:", error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Gambit API server running on http://localhost:${PORT}`);
  console.log(`
  Endpoints:
    POST /auth/login          - Login/register user
    POST /auth/logout         - Logout
    GET  /auth/session        - Validate session
    GET  /auth/me             - Get user info
    
    GET  /wallet/balance      - Get wallet balance
    GET  /wallet/deposit-address - Get deposit address
    POST /wallet/withdraw     - Withdraw to external wallet
    GET  /wallet/transactions - Transaction history
    
    GET  /health              - Health check
  `);
});

export { server };
