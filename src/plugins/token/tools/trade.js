/**
 * Trade Tool - Jupiter Swap
 * Swap tokens using Jupiter Exchange
 */
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { getConnection } from "../../../solana/client.js";
import { getUserKeypair } from "../../../auth/user-wallet.js";
import { TOKENS, JUPITER_API } from "../../base.js";

const DEFAULT_SLIPPAGE_BPS = 300; // 3%

/**
 * Swap tokens using Jupiter Exchange
 * @param {Object} ctx - Gambit context
 * @param {string} userId - User ID
 * @param {string} outputMint - Target token mint address
 * @param {number} inputAmount - Amount to swap
 * @param {string} inputMint - Source token mint (defaults to SOL)
 * @param {number} slippageBps - Slippage tolerance in basis points
 * @returns {Promise<string>} Transaction signature
 */
export async function trade(ctx, userId, outputMint, inputAmount, inputMint = TOKENS.SOL, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  const conn = getConnection();
  const keypair = await getUserKeypair(userId);

  const inputMintPubkey = new PublicKey(inputMint);
  const outputMintPubkey = new PublicKey(outputMint);

  // Check if input is native SOL
  const isNativeSol = inputMint === TOKENS.SOL;

  // Get decimals
  let inputDecimals;
  if (isNativeSol) {
    inputDecimals = 9;
  } else {
    const mintInfo = await getMint(conn, inputMintPubkey);
    inputDecimals = mintInfo.decimals;
  }

  const scaledAmount = Math.floor(inputAmount * Math.pow(10, inputDecimals));

  // Get quote from Jupiter
  const quoteUrl = new URL(JUPITER_API.QUOTE);
  quoteUrl.searchParams.set("inputMint", inputMint);
  quoteUrl.searchParams.set("outputMint", outputMint);
  quoteUrl.searchParams.set("amount", scaledAmount.toString());
  quoteUrl.searchParams.set("slippageBps", slippageBps.toString());
  quoteUrl.searchParams.set("dynamicSlippage", "true");
  quoteUrl.searchParams.set("onlyDirectRoutes", "false");
  quoteUrl.searchParams.set("maxAccounts", "64");

  const quoteResponse = await fetch(quoteUrl.toString()).then((r) => r.json());

  if (quoteResponse.error) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.error}`);
  }

  // Get swap transaction
  const swapResponse = await fetch(JUPITER_API.SWAP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: keypair.publicKey.toString(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000000,
          global: false,
          priorityLevel: "medium",
        },
      },
    }),
  }).then((r) => r.json());

  if (swapResponse.error) {
    throw new Error(`Jupiter swap failed: ${swapResponse.error}`);
  }

  // Deserialize and sign transaction
  const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  const { blockhash } = await conn.getLatestBlockhash();
  transaction.message.recentBlockhash = blockhash;

  transaction.sign([keypair]);

  // Send transaction
  const signature = await conn.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await conn.confirmTransaction(signature);

  return signature;
}

/**
 * Get price quote without executing
 */
export async function getQuote(ctx, outputMint, inputAmount, inputMint = TOKENS.SOL) {
  const inputMintPubkey = new PublicKey(inputMint);
  const isNativeSol = inputMint === TOKENS.SOL;

  let inputDecimals;
  if (isNativeSol) {
    inputDecimals = 9;
  } else {
    const conn = getConnection();
    const mintInfo = await getMint(conn, inputMintPubkey);
    inputDecimals = mintInfo.decimals;
  }

  const scaledAmount = Math.floor(inputAmount * Math.pow(10, inputDecimals));

  const quoteUrl = new URL(JUPITER_API.QUOTE);
  quoteUrl.searchParams.set("inputMint", inputMint);
  quoteUrl.searchParams.set("outputMint", outputMint);
  quoteUrl.searchParams.set("amount", scaledAmount.toString());
  quoteUrl.searchParams.set("slippageBps", "300");

  const quoteResponse = await fetch(quoteUrl.toString()).then((r) => r.json());

  if (quoteResponse.error) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.error}`);
  }

  return {
    inputMint,
    outputMint,
    inputAmount,
    outputAmount: quoteResponse.outAmount,
    priceImpactPct: quoteResponse.priceImpactPct,
    routePlan: quoteResponse.routePlan?.map((r) => r.swapInfo?.label).filter(Boolean),
  };
}

export default { trade, getQuote };
