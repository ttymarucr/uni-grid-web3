import JSBI from "jsbi";
import { Fraction } from "@uniswap/sdk-core";
import { TickMath, SqrtPriceMath } from "@uniswap/v3-sdk";

/**
 * Converts liquidity into token amounts.
 * @param liquidity The liquidity of the position.
 * @param tickLower The lower tick of the position.
 * @param tickUpper The upper tick of the position.
 * @param sqrtPriceX96 The current sqrt price of the pool.
 * @param token0Decimals The number of decimals for token0.
 * @param token1Decimals The number of decimals for token1.
 * @returns The token amounts as human-readable strings.
 */
export const liquidityToTokenAmounts = (
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  token0Decimals: number,
  token1Decimals: number
): { amount0: number; amount1: number } => {
  // Get sqrt prices for the tick range
  const sqrtPriceLowerX96 = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtPriceUpperX96 = TickMath.getSqrtRatioAtTick(tickUpper);

  // Calculate token amounts
  const amount0 = SqrtPriceMath.getAmount0Delta(
    sqrtPriceLowerX96,
    sqrtPriceUpperX96,
    JSBI.BigInt(liquidity.toString()),
    true
  );
  const amount1 = SqrtPriceMath.getAmount1Delta(
    sqrtPriceLowerX96,
    sqrtPriceUpperX96,
    JSBI.BigInt(liquidity.toString()),
    true
  );

  return {
    amount0: fromRawTokenAmount(BigInt(amount0.toString()), token0Decimals),
    amount1: fromRawTokenAmount(BigInt(amount1.toString()), token1Decimals),
  };
};

export const fromRawTokenAmount = (
  amount: bigint,
  tokenDecimals: number
): number => {
  // Convert the raw value to a human-readable format using token decimals
  const tokenValue = new Fraction(
    amount.toString(),
    JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(tokenDecimals)).toString()
  );
  return Number(tokenValue.toFixed(tokenDecimals));
};

/**
 * Converts a tick value into a price.
 * @param tick The tick value (e.g., tickLower or tickUpper).
 * @param token0Decimals The number of decimals for token0.
 * @param token1Decimals The number of decimals for token1.
 * @returns The price as a human-readable string.
 */
export const tickToPrice = (
  tick: number,
  token0Decimals: number,
  token1Decimals: number
): [number, number] => {
  const tickRatio = Math.pow(1.0001, tick);
  const price = tickRatio / Math.pow(10, token1Decimals - token0Decimals);
  return [price, 1 / price];
};
