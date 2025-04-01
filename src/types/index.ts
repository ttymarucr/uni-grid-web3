export interface Position {
  tokenId: bigint; // The unique identifier of the position (uint256 in Solidity)
  tickLower: number; // The lower tick of the position (int24 in Solidity)
  tickUpper: number; // The upper tick of the position (int24 in Solidity)
  liquidity: bigint; // The liquidity of the position (uint128 in Solidity, represented as a string in TypeScript)
  index: bigint; // The index of the position in the array (uint256 in Solidity)
}
