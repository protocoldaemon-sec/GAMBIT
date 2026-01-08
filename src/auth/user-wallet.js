/**
 * User Wallet Management
 * Links users to their generated vanity wallets
 */
import { supabase } from "../supabase/client.js";
import { generateVanityWallet, generateVanityWalletFast } from "./vanity-wallet.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const USERS_TABLE = "gambit_users";
const WALLETS_TABLE = "gambit_wallets";

/**
 * Create or get user wallet on login
 */
export async function getOrCreateUserWallet(userId, email = null) {
  // Check if user already has a wallet
  if (supabase) {
    const { data: existingWallet } = await supabase
      .from(WALLETS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existingWallet) {
      console.log(`📱 Existing wallet found for user ${userId}`);
      return {
        userId,
        publicKey: existingWallet.public_key,
        isNew: false,
      };
    }
  }

  // Generate new vanity wallet
  console.log(`🆕 Creating new wallet for user ${userId}`);
  const wallet = generateVanityWalletFast("gam"); // Fast generation with "gam" prefix

  // Store in Supabase
  if (supabase) {
    // Create user record
    await supabase.from(USERS_TABLE).upsert({
      id: userId,
      email,
      created_at: new Date().toISOString(),
    });

    // Store wallet (encrypted secret key in production!)
    await supabase.from(WALLETS_TABLE).insert({
      user_id: userId,
      public_key: wallet.publicKey,
      encrypted_secret: wallet.secretKey, // TODO: Encrypt with KMS in production
      created_at: new Date().toISOString(),
    });
  }

  return {
    userId,
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey, // Only return on creation
    isNew: true,
  };
}

/**
 * Get user's wallet keypair for signing
 */
export async function getUserKeypair(userId) {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  const { data: wallet, error } = await supabase
    .from(WALLETS_TABLE)
    .select("encrypted_secret")
    .eq("user_id", userId)
    .single();

  if (error || !wallet) {
    throw new Error(`Wallet not found for user ${userId}`);
  }

  // Decrypt and create keypair (TODO: Use KMS in production)
  const secretKey = bs58.decode(wallet.encrypted_secret);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Get user's public key
 */
export async function getUserPublicKey(userId) {
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  const { data: wallet, error } = await supabase
    .from(WALLETS_TABLE)
    .select("public_key")
    .eq("user_id", userId)
    .single();

  if (error || !wallet) {
    throw new Error(`Wallet not found for user ${userId}`);
  }

  return wallet.public_key;
}

/**
 * List all user wallets (admin)
 */
export async function listUserWallets(limit = 50) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(WALLETS_TABLE)
    .select(`
      user_id,
      public_key,
      created_at,
      ${USERS_TABLE} (email)
    `)
    .limit(limit)
    .order("created_at", { ascending: false });

  return data || [];
}
