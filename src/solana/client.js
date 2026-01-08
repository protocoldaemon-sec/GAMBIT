/**
 * Solana Client
 * Native Solana operations using @solana/web3.js
 */
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

let connection = null;

export function getConnection() {
  if (!connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    connection = new Connection(rpcUrl, "confirmed");
  }
  return connection;
}

export function createKeypairFromSecret(secretKey) {
  const decoded = bs58.decode(secretKey);
  return Keypair.fromSecretKey(decoded);
}

export async function getWalletBalance(address = null, keypair = null) {
  const conn = getConnection();
  const pubkey = address ? new PublicKey(address) : keypair?.publicKey;
  
  if (!pubkey) throw new Error("Address or keypair required");
  
  const balance = await conn.getBalance(pubkey);
  
  return {
    address: pubkey.toString(),
    lamports: balance,
    sol: balance / LAMPORTS_PER_SOL,
  };
}

export async function getTokenBalance(mintAddress, ownerAddress) {
  const conn = getConnection();
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);

  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(owner, { mint });
  
  if (tokenAccounts.value.length === 0) {
    return { balance: 0, decimals: 0 };
  }

  const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
  return {
    balance: accountInfo.tokenAmount.uiAmount,
    decimals: accountInfo.tokenAmount.decimals,
    mint: mintAddress,
  };
}

export async function transferSol(fromKeypair, toAddress, amountSol) {
  const conn = getConnection();
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports,
    })
  );

  const signature = await conn.sendTransaction(transaction, [fromKeypair]);
  await conn.confirmTransaction(signature);

  return { signature, to: toAddress, amount: amountSol };
}

export async function transferToken(fromKeypair, toAddress, mintAddress, amount, decimals = 6) {
  const conn = getConnection();
  const mint = new PublicKey(mintAddress);
  const fromAta = await getAssociatedTokenAddress(mint, fromKeypair.publicKey);
  const toAta = await getAssociatedTokenAddress(mint, new PublicKey(toAddress));

  const amountInSmallestUnit = Math.floor(amount * Math.pow(10, decimals));

  const transaction = new Transaction().add(
    createTransferInstruction(
      fromAta,
      toAta,
      fromKeypair.publicKey,
      amountInSmallestUnit,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const signature = await conn.sendTransaction(transaction, [fromKeypair]);
  await conn.confirmTransaction(signature);

  return { signature, to: toAddress, amount, mint: mintAddress };
}

export async function getTransaction(signature) {
  const conn = getConnection();
  const tx = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) return null;

  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    fee: tx.meta?.fee,
    status: tx.meta?.err ? "failed" : "success",
    instructions: tx.transaction.message.instructions.length,
  };
}
