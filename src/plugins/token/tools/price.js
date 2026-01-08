/**
 * Price Tool
 * Fetch token prices from Jupiter
 */
import { JUPITER_API, TOKENS } from "../../base.js";

/**
 * Fetch price for a token
 * @param {string} mint - Token mint address
 * @param {string} vsToken - Quote token (default: USDC)
 * @returns {Promise<Object>} Price data
 */
export async function fetchPrice(mint, vsToken = TOKENS.USDC) {
  const url = new URL(JUPITER_API.PRICE);
  url.searchParams.set("ids", mint);
  url.searchParams.set("vsToken", vsToken);

  const response = await fetch(url.toString()).then((r) => r.json());

  if (!response.data?.[mint]) {
    throw new Error(`Price not found for ${mint}`);
  }

  const priceData = response.data[mint];

  return {
    mint,
    price: priceData.price,
    vsToken,
    mintSymbol: priceData.mintSymbol,
    vsTokenSymbol: priceData.vsTokenSymbol,
  };
}

/**
 * Fetch prices for multiple tokens
 * @param {string[]} mints - Array of token mint addresses
 * @param {string} vsToken - Quote token (default: USDC)
 * @returns {Promise<Object>} Price data for all tokens
 */
export async function fetchPrices(mints, vsToken = TOKENS.USDC) {
  const url = new URL(JUPITER_API.PRICE);
  url.searchParams.set("ids", mints.join(","));
  url.searchParams.set("vsToken", vsToken);

  const response = await fetch(url.toString()).then((r) => r.json());

  const prices = {};
  for (const mint of mints) {
    if (response.data?.[mint]) {
      prices[mint] = {
        price: response.data[mint].price,
        mintSymbol: response.data[mint].mintSymbol,
      };
    }
  }

  return { prices, vsToken };
}

export default { fetchPrice, fetchPrices };
