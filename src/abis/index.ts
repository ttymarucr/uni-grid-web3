
import {abi as GridPositionManager} from './GridPositionManager';
import {abi as GridManager} from './GridManager';
import {abi as IUniswapV3Pool} from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import {abi as INonfungiblePositionManager} from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json';
import {abi as IERC20Metadata} from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IERC20Metadata.sol/IERC20Metadata.json';
import {abi as IUniswapV3Factory} from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json';

export const GridPositionManagerABI = GridPositionManager;
export const IUniswapV3PoolABI = IUniswapV3Pool;
export const INonfungiblePositionManagerABI = INonfungiblePositionManager;
export const IERC20MetadataABI = IERC20Metadata;
export const GridManagerABI = GridManager;
export const IUniswapV3FactoryABI = IUniswapV3Factory;