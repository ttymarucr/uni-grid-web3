import JSBI from "jsbi";
import { Fraction, Price, Token } from "@uniswap/sdk-core";
import {
  TickMath,
  SqrtPriceMath,
  encodeSqrtRatioX96,
  tickToPrice as tickToPriceUni,
  nearestUsableTick,
} from "@uniswap/v3-sdk";

// constants used internally but not expected to be used externally
export const NEGATIVE_ONE = JSBI.BigInt(-1);
export const ZERO = JSBI.BigInt(0);
export const ONE = JSBI.BigInt(1);

// used in liquidity amount math
export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
export const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2));

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
  tokenDecimals: number = 18
): number => {
  // Convert the raw value to a human-readable format using token decimals
  const tokenValue = new Fraction(
    amount.toString(),
    JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(tokenDecimals)).toString()
  );
  return Number(tokenValue.toFixed(tokenDecimals));
};

export const toRawTokenAmount = (
  amount: number,
  tokenDecimals: number = 18
): bigint => {
  const scale = Math.pow(10, tokenDecimals); // Scale factor (10^decimals)
  return BigInt(Math.floor(amount * scale)); // Multiply and convert to bigint
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
  const price = tickRatio / Math.pow(10, token0Decimals - token1Decimals);
  return [price, 1 / price];
};

export function tickToPriceUtils(
  baseToken: Token,
  quoteToken: Token,
  tick: number
): Price<Token, Token> {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
  const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96);

  return baseToken.sortsBefore(quoteToken)
    ? new Price(baseToken, quoteToken, Q192.toString(), ratioX192.toString())
    : new Price(baseToken, quoteToken, ratioX192.toString(), Q192.toString());
}

export const priceToTick = (
  baseToken: Token,
  quoteToken: Token,
  token1Price: number,
  tickSpacing: number
): number => {
  const tick = Math.floor(
    Math.log(
      (1 * 10 ** quoteToken.decimals) / (token1Price * 10 ** baseToken.decimals)
    ) / Math.log(1.0001)
  );
  return nearestUsableTick(tick, tickSpacing);
};

export function priceToClosestTickUtils(price: Price<Token, Token>): number {
  const sorted = price.baseCurrency.sortsBefore(price.quoteCurrency);

  const sqrtRatioX96 = sorted
    ? encodeSqrtRatioX96(price.numerator, price.denominator)
    : encodeSqrtRatioX96(price.denominator, price.numerator);

  let tick = TickMath.getTickAtSqrtRatio(sqrtRatioX96);
  const nextTickPrice = tickToPriceUtils(
    price.baseCurrency,
    price.quoteCurrency,
    tick + 1
  );
  if (sorted) {
    if (!price.lessThan(nextTickPrice)) {
      tick++;
    }
  } else {
    if (!price.greaterThan(nextTickPrice)) {
      tick++;
    }
  }
  return tick;
}
