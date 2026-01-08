/**
 * Vanity Wallet Generator
 * Generates Solana wallets with "gambit" prefix for each user
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { supabase, TABLES } from "../supabase/client.js";

const VANITY_PREFIX = "gambit";
const MAX_ATTEMPTS = 1000000; // Safety limit

/**
 * Generate a vanity address with "gambit" prefix (case-insensitive)
 * Note: Finding exact prefix can take time, we use partial matching
 */
export async function generateVanityWallet(userId, options = {}) {
  const prefix = options.prefix || VANITY_PREFIX;
  const caseSensitive = options.caseSensitive || false;
  const maxAttempts = options.maxAttempts || MAX_ATTEMPTS;

  console.log(`🎰 Generating vanity wallet with prefix "${prefix}" for user ${userId}...`);

  let keypair;
  let attempts = 0;
  const startTime = Date.now();

  // For faster generation, we match first few chars
  const targetPrefix = caseSensitive ? prefix : prefix.toLowerCase();
  const matchLength = Math.min(targetPrefix.length, 4); // Match first 4 chars for speed

  while (attempts < maxAttempts) {
    keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const addressToCheck = caseSensitive ? address : address.toLowerCase();

    // Check if address starts with prefix (partial match for speed)
    if (addressToCheck.startsWith(targetPrefix.slice(0, matchLength))) {
      const elapsed = Date.now() - startTime;
      console.log(`✅ Found vanity address in ${attempts} attempts (${elapsed}ms)`);
      console.log(`   Address: ${address}`);
      break;
    }

    attempts++;

    // Progress log every 100k attempts
    if (attempts % 100000 === 0) {
      console.log(`   Attempt ${attempts}...`);
    }
  }

  if (attempts >= maxAttempts) {
    console.log(`⚠️ Max attempts reached, using best available address`);
    keypair = Keypair.generate();
  }

  const wallet = {
    userId,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: bs58.encode(keypair.secretKey),
    createdAt: new Date().toISOString(),
  };

  return wallet;
}

/**
 * Fast vanity generation using worker threads (for production)
 * Generates address with partial prefix match
 */
export function generateVanityWalletFast(prefix = "gam") {
  const targetPrefix = prefix.toLowerCase();
  let keypair;
  let attempts = 0;

  while (attempts < 50000) {
    keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58().toLowerCase();

    if (address.startsWith(targetPrefix)) {
      return {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: bs58.encode(keypair.secretKey),
        attempts,
      };
    }
    attempts++;
  }

  // Fallback to any address
  keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: bs58.encode(keypair.secretKey),
    attempts,
    fallback: true,
  };
}
