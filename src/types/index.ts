export interface GridPosition {
  tokenId: bigint; // The unique identifier of the position (uint256 in Solidity)
  tickLower: number; // The lower tick of the position (int24 in Solidity)
  tickUpper: number; // The upper tick of the position (int24 in Solidity)
  liquidity: bigint; // The liquidity of the position (uint128 in Solidity, represented as a string in TypeScript)
  index: bigint; // The index of the position in the array (uint256 in Solidity)
}

export interface Position extends GridPosition {
  priceLower: number;
  priceUpper: number;
  feesToken0: number;
  feesToken1: number;
  liquidityToken0: number;
  liquidityToken1: number;
}

export interface TokenMetadata {
  address?: string; // The contract address of the token (string in Solidity)
  symbol: string; // The symbol of the token (string in Solidity)
  decimals: number; // The number of decimals for the token (uint8 in Solidity)
}

export interface PoolMetadata {
  address: `0x${string}`; // The contract address of the pool (string in Solidity)
  token0: TokenMetadata; // Metadata for token0 in the pool
  token1: TokenMetadata; // Metadata for token1 in the pool
  fee: number; // The fee tier of the pool (uint24 in Solidity)
  tick: number; // The current tick of the pool (int24 in Solidity)
}

export interface PoolInfo {
  pool: `0x${string}`; // Address of the Uniswap V3 pool
  positionManager: `0x${string}`; // Address of the Uniswap V3 position manager
  gridStep: bigint; // Step size for the grid
  gridQuantity: bigint; // Quantity of positions in the grid
  fee: number; // Fee tier of the pool
  token0MinFees: bigint; // Minimum fees for token0
  token1MinFees: bigint; // Minimum fees for token1
  token0Decimals: number; // Decimals for token0
  token1Decimals: number; // Decimals for token1
  token0Symbol: string; // Symbol for token0
  token1Symbol: string; // Symbol for token1
  token0: `0x${string}`; // Address for token0
  token1: `0x${string}`; // Address for token1
}

export interface GridDeployment extends PoolInfo {
  owner: `0x${string}`; // Address of the owner of the grid
  grid: `0x${string}`; // Address of the grid contract
  gridPositionManager: `0x${string}`; // Address of the Uniswap V3 position manager
  token0Liquidity: bigint; // Liquidity for token0
  token1Liquidity: bigint; // Liquidity for token1
  isInRange: boolean; // Whether the grid is in range
  isNew: boolean; // Whether the grid is new
  blockNumber: bigint; // Block number of the grid deployment
}

export interface GridState {
  token0MinFees: bigint;
  token1MinFees: bigint;
  token0Liquidity: bigint;
  token1Liquidity: bigint;
  isInRange: boolean;
  gridStep: bigint;
  gridQuantity: bigint;
}

export interface TrustedToken {
  address: `0x${string}`;
  symbol: string;
}

export interface DeploymentConfig {
  gridManager: `0x${string}`;
  uniswapV3PositionManager: `0x${string}`;
  uniswapV3Factory: `0x${string}`;
  subgraphId: string;
  gridManagerSubgraphId: string;
  uniswapChain: string;
}

export interface DeploymentConfigMap {
  [key: string]: DeploymentConfig;
}
