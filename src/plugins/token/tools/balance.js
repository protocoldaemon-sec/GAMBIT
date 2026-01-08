/**
 * Balance Tools
 * Get SOL and token balances
 */
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getConnection } from "../../../solana/client.js";

/**
 * Get SOL balance for an address
 */
export async function getBalance(ctx, address) {
  const conn = getConnection();
  const pubkey = new PublicKey(address);
  const balance = await conn.getBalance(pubkey);

  return {
    address,
    balance: `${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    lamports: balance,
    sol: balance / LAMPORTS_PER_SOL,
  };
}

/**
 * Get SPL token balance for an address
 */
export async function getTokenBalance(ctx, mintAddress, ownerAddress) {
  const conn = getConnection();
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);

  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(owner, { mint });

  if (tokenAccounts.value.length === 0) {
    return { balance: 0, decimals: 0, mint: mintAddress };
  }

  const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
  return {
    balance: accountInfo.tokenAmount.uiAmount,
    decimals: accountInfo.tokenAmount.decimals,
    mint: mintAddress,
  };
}

/**
 * Get all token balances for an address
 */
export async function getAllBalances(ctx, address) {
  const conn = getConnection();
  const pubkey = new PublicKey(address);

  // Get SOL balance
  const solBalance = await conn.getBalance(pubkey);

  // Get all token accounts
  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
    programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  });

  const tokens = tokenAccounts.value
    .map((account) => {
      const info = account.account.data.parsed.info;
      return {
        mint: info.mint,
        balance: info.tokenAmount.uiAmount,
        decimals: info.tokenAmount.decimals,
      };
    })
    .filter((t) => t.balance > 0);

  return {
    sol: {
      balance: solBalance / LAMPORTS_PER_SOL,
      lamports: solBalance,
    },
    tokens,
  };
}

export default { getBalance, getTokenBalance, getAllBalances };
