/**
 * Treasury Management
 * Handles user deposits, withdrawals, and Kalshi deposits
 * 
 * Flow:
 * 1. User deposits SOL/USDC to their agent wallet (vanity address)
 * 2. Agent can use funds for trading on Kalshi via DFlow
 * 3. User asks agent to withdraw -> agent sends back to user's external wallet
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { supabase } from "../supabase/client.js";
import { getUserKeypair } from "../auth/user-wallet.js";

// Known addresses
const KALSHI_DEPOSIT_ADDRESS = process.env.KALSHI_DEPOSIT_ADDRESS || "KALSHi1111111111111111111111111111111111111";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Mainnet USDC

/**
 * User deposit tracking
 * Stores the user's external wallet for withdrawals
 */
export async function registerUserDeposit(userId, agentWallet, fromAddress, amount, tokenMint = null) {
  const depositRecord = {
    user_id: userId,
    agent_wallet: agentWallet,
    user_external_wallet: fromAddress, // Remember where funds came from
    amount,
    token_mint: tokenMint,
    tx_type: "deposit",
    status: "confirmed",
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from("gambit_transactions").insert(depositRecord);
    
    // Update user's known external wallet
    await supabase.from("gambit_users").update({
      external_wallet: fromAddress,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
  }

  console.log(`💰 Deposit registered: ${amount} from ${fromAddress} to agent ${agentWallet}`);
  return depositRecord;
}

/**
 * Get user's registered external wallet
 */
export async function getUserExternalWallet(userId) {
  if (!supabase) return null;

  const { data } = await supabase
    .from("gambit_users")
    .select("external_wallet")
    .eq("id", userId)
    .single();

  return data?.external_wallet;
}

/**
 * Withdraw SOL to user's external wallet
 */
export async function withdrawSol(userId, amount) {
  const keypair = await getUserKeypair(userId);
  const externalWallet = await getUserExternalWallet(userId);

  if (!externalWallet) {
    throw new Error("No external wallet registered. Please deposit first to register your wallet.");
  }

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
  
  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < lamports + 5000) { // 5000 lamports for fee
    throw new Error(`Insufficient balance. Have: ${balance / LAMPORTS_PER_SOL} SOL, Need: ${amount} SOL`);
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(externalWallet),
      lamports,
    })
  );

  const signature = await connection.sendTransaction(transaction, [keypair]);
  await connection.confirmTransaction(signature);

  // Record withdrawal
  if (supabase) {
    await supabase.from("gambit_transactions").insert({
      user_id: userId,
      wallet_address: keypair.publicKey.toString(),
      tx_signature: signature,
      tx_type: "withdraw",
      amount,
      status: "confirmed",
      metadata: { to: externalWallet },
      created_at: new Date().toISOString(),
    });
  }

  console.log(`💸 Withdrawal: ${amount} SOL to ${externalWallet}`);
  return { signature, to: externalWallet, amount };
}

/**
 * Withdraw USDC to user's external wallet
 */
export async function withdrawUsdc(userId, amount) {
  const keypair = await getUserKeypair(userId);
  const externalWallet = await getUserExternalWallet(userId);

  if (!externalWallet) {
    throw new Error("No external wallet registered. Please deposit first.");
  }

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  const mint = new PublicKey(USDC_MINT);
  const fromAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, new PublicKey(externalWallet));

  // USDC has 6 decimals
  const amountInSmallestUnit = Math.floor(amount * 1_000_000);

  const transaction = new Transaction().add(
    createTransferInstruction(
      fromAta,
      toAta,
      keypair.publicKey,
      amountInSmallestUnit,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await connection.sendTransaction(transaction, [keypair]);
  await connection.confirmTransaction(signature);

  if (supabase) {
    await supabase.from("gambit_transactions").insert({
      user_id: userId,
      wallet_address: keypair.publicKey.toString(),
      tx_signature: signature,
      tx_type: "withdraw",
      amount,
      token_mint: USDC_MINT,
      status: "confirmed",
      metadata: { to: externalWallet },
      created_at: new Date().toISOString(),
    });
  }

  return { signature, to: externalWallet, amount };
}

/**
 * Deposit to Kalshi (for trading)
 */
export async function depositToKalshi(userId, amount) {
  const keypair = await getUserKeypair(userId);
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  const mint = new PublicKey(USDC_MINT);
  const fromAta = await getAssociatedTokenAddress(mint, keypair.publicKey);
  const kalshiAta = await getAssociatedTokenAddress(mint, new PublicKey(KALSHI_DEPOSIT_ADDRESS));

  const amountInSmallestUnit = Math.floor(amount * 1_000_000);

  const transaction = new Transaction().add(
    createTransferInstruction(
      fromAta,
      kalshiAta,
      keypair.publicKey,
      amountInSmallestUnit,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await connection.sendTransaction(transaction, [keypair]);
  await connection.confirmTransaction(signature);

  if (supabase) {
    await supabase.from("gambit_transactions").insert({
      user_id: userId,
      wallet_address: keypair.publicKey.toString(),
      tx_signature: signature,
      tx_type: "kalshi_deposit",
      amount,
      token_mint: USDC_MINT,
      status: "confirmed",
      metadata: { to: KALSHI_DEPOSIT_ADDRESS },
      created_at: new Date().toISOString(),
    });
  }

  return { signature, to: KALSHI_DEPOSIT_ADDRESS, amount };
}

/**
 * Get agent wallet balance
 */
export async function getAgentBalance(userId) {
  const keypair = await getUserKeypair(userId);
  
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  const solBalance = await connection.getBalance(keypair.publicKey);
  
  // Get USDC balance
  let usdcBalance = 0;
  try {
    const mint = new PublicKey(USDC_MINT);
    const ata = await getAssociatedTokenAddress(mint, keypair.publicKey);
    const tokenAccount = await connection.getTokenAccountBalance(ata);
    usdcBalance = tokenAccount.value.uiAmount || 0;
  } catch (e) {
    // No USDC account
  }

  return {
    address: keypair.publicKey.toString(),
    sol: solBalance / LAMPORTS_PER_SOL,
    usdc: usdcBalance,
  };
}

/**
 * Get transaction history for user
 */
export async function getTransactionHistory(userId, limit = 20) {
  if (!supabase) return [];

  const { data } = await supabase
    .from("gambit_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
