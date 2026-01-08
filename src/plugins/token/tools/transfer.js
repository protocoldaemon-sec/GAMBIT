/**
 * Transfer Tool
 * Transfer SOL or SPL tokens
 */
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { getConnection } from "../../../solana/client.js";
import { getUserKeypair } from "../../../auth/user-wallet.js";

/**
 * Transfer SOL or SPL tokens to a recipient
 * @param {Object} ctx - Gambit context
 * @param {string} userId - User ID
 * @param {string} to - Recipient address
 * @param {number} amount - Amount to transfer
 * @param {string} mint - Optional token mint address
 * @returns {Promise<string>} Transaction signature
 */
export async function transfer(ctx, userId, to, amount, mint) {
  const conn = getConnection();
  const keypair = await getUserKeypair(userId);
  const recipient = new PublicKey(to);

  let signature;

  if (!mint) {
    // Transfer native SOL
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    signature = await conn.sendTransaction(transaction, [keypair]);
    await conn.confirmTransaction(signature);
  } else {
    // Transfer SPL token
    const mintPubkey = new PublicKey(mint);
    const transaction = new Transaction();

    const fromAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
    const toAta = await getAssociatedTokenAddress(mintPubkey, recipient);

    // Check if recipient ATA exists
    try {
      await getAccount(conn, toAta);
    } catch {
      // Create ATA if it doesn't exist
      transaction.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          toAta,
          recipient,
          mintPubkey
        )
      );
    }

    // Get mint info for decimals
    const mintInfo = await getMint(conn, mintPubkey);
    const adjustedAmount = Math.floor(amount * Math.pow(10, mintInfo.decimals));

    transaction.add(
      createTransferInstruction(fromAta, toAta, keypair.publicKey, adjustedAmount)
    );

    const { blockhash } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    signature = await conn.sendTransaction(transaction, [keypair]);
    await conn.confirmTransaction(signature);
  }

  return signature;
}

export default { transfer };
