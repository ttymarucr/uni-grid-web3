export interface GridPosition {
  tokenId: bigint; // The unique identifier of the position (uint256 in Solidity)
  tickLower: number; // The lower tick of the position (int24 in Solidity)
  tickUpper: number; // The upper tick of the position (int24 in Solidity)
  liquidity: bigint; // The liquidity of the position (uint128 in Solidity, represented as a string in TypeScript)
  index: bigint; // The index of the position in the array (uint256 in Solidity)
}

export interface Position extends GridPosition {
  priceLower: number
  priceUpper: number
  feesToken0: number
  feesToken1: number
  liquidityToken0: number
  liquidityToken1: number
}

export interface TokenMetadata {
  address: string; // The contract address of the token (string in Solidity)
  symbol: string; // The symbol of the token (string in Solidity)
  decimals: number; // The number of decimals for the token (uint8 in Solidity)
}

export interface PoolInfo { 
  address: `0x${string}`; // The contract address of the pool (string in Solidity)
  token0: TokenMetadata; // Metadata for token0 in the pool
  token1: TokenMetadata; // Metadata for token1 in the pool
  fee: number; // The fee tier of the pool (uint24 in Solidity)
}