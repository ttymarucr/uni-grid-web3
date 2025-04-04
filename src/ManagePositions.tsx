import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  getAccount,
  readContract,
  writeContract,
  connect,
  disconnect,
  multicall,
  simulateContract,
} from "@wagmi/core";
import { ToastContainer, toast } from "react-toastify";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import annotationPlugin from "chartjs-plugin-annotation";

import {
  GridPositionManagerABI,
  IUniswapV3PoolABI,
  INonfungiblePositionManagerABI,
  IERC20MetadataABI,
} from "./abis";
import { config } from "./config";
import { GridPosition, PoolInfo, Position, TokenMetadata } from "./types";
import { maxUint128 } from "viem";
import { fromRawTokenAmount, liquidityToTokenAmounts, tickToPrice } from "./utils/uniswapUtils";

// Register Chart.js components to avoid re-registration issues
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Title, annotationPlugin);

const ManagePositions: React.FC = () => {
  const NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS =
    "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
  const { contractAddress } = useParams<{ contractAddress: `0x${string}` }>();
  const { address, isConnected } = getAccount(config);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pool, setPool] = useState<PoolInfo>();

  console.log(address, isConnected, contractAddress);

  const fetchPositions = useCallback(async () => {
    if (isConnected && address && contractAddress) {
      try {
        const [activeIndexes, poolAddress] = await multicall(config, {
          contracts: [
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getActivePositionIndexes",
            },
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getPool",
            },
          ],
        });

        if (activeIndexes.status == "success") {
          const positionResults = await multicall(config, {
            contracts: activeIndexes.result.map((index) => ({
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getPosition",
              args: [BigInt(index)],
            })),
          });

          const gridPositions: GridPosition[] = positionResults
            .map(({ status, result }) => {
              if (status == "success") {
                return {
                  tokenId: result.tokenId,
                  tickLower: result.tickLower,
                  tickUpper: result.tickUpper,
                  liquidity: result.liquidity,
                  index: result.index,
                };
              }
              return null;
            })
            .filter((position) => position !== null);

          if (poolAddress.status == "success") {
            const [slot0, token0, token1] = await multicall(config, {
              contracts: [
                {
                  address: poolAddress.result,
                  abi: IUniswapV3PoolABI,
                  functionName: "slot0",
                },
                {
                  address: poolAddress.result,
                  abi: IUniswapV3PoolABI,
                  functionName: "token0",
                },
                {
                  address: poolAddress.result,
                  abi: IUniswapV3PoolABI,
                  functionName: "token1",
                },
              ],
            });
            const [
              { result: token0Decimals },
              { result: token0Symbol },
              { result: token1Decimals },
              { result: token1Symbol },
            ] = await multicall(config, {
              contracts: [
                {
                  address: token0.result,
                  abi: IERC20MetadataABI,
                  functionName: "decimals",
                },
                {
                  address: token0.result,
                  abi: IERC20MetadataABI,
                  functionName: "symbol",
                },
                {
                  address: token1.result,
                  abi: IERC20MetadataABI,
                  functionName: "decimals",
                },
                {
                  address: token1.result,
                  abi: IERC20MetadataABI,
                  functionName: "symbol",
                },
              ],
            });
            const token0Meta = {
              address: token0.result || "0x00",
              symbol: token0Symbol || "Token 0",
              decimals: token0Decimals || 18,
            } as TokenMetadata;
            const token1Meta = {
              address: token1.result || "0x00",
              symbol: token1Symbol || "Token 1",
              decimals: token1Decimals || 18,
            } as TokenMetadata;

            const poolFees = gridPositions.map((position) =>
              simulateContract(config, {
                address: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
                abi: INonfungiblePositionManagerABI,
                functionName: "collect",
                args: [
                  {
                    tokenId: position.tokenId,
                    recipient: contractAddress,
                    amount0Max: maxUint128,
                    amount1Max: maxUint128,
                  },
                ],
                account: contractAddress,
              })
            );
            const poolFeesResponse = (await Promise.all(poolFees)).reduce(
              (acc, { result, request }) => {
                if (result) {
                  acc[Number(request.args[0].tokenId)] = result;
                }
                return acc;
              },
              {} as Record<number, [bigint, bigint]>
            );

            const positionsWithFees: Position = gridPositions.map(
              (position) => {
                const [feesToken0, feesToken1] = poolFeesResponse[
                  Number(position.tokenId)
                ] || [0n, 0n];
                const liq = liquidityToTokenAmounts(
                  position.liquidity,
                  position.tickLower,
                  position.tickUpper,
                  token0Meta.decimals,
                  token1Meta.decimals
                );
                return {
                  ...position,
                  priceLower: tickToPrice(
                    position.tickLower,
                    token0Meta.decimals,
                    token1Meta.decimals
                  )[0],
                  priceUpper: tickToPrice(
                    position.tickUpper,
                    token0Meta.decimals,
                    token1Meta.decimals
                  )[0],
                  feesToken0: fromRawTokenAmount(
                    feesToken0,
                    token0Meta.decimals
                  ),
                  feesToken1: fromRawTokenAmount(
                    feesToken1,
                    token1Meta.decimals
                  ),
                  liquidityToken0: liq.amount0,
                  liquidityToken1: liq.amount1,
                };
              }
            );
            setPositions(positionsWithFees);
            setPool({
              address: poolAddress.result,
              token0: token0Meta,
              token1: token1Meta,
              fee: slot0.result?.[5],
              tick: slot0.result?.[1],
            } as PoolInfo);
          }
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
    }
  }, [address, isConnected, contractAddress]);

  const handleContractAction = async (
    functionName:
      | "deposit"
      | "close"
      | "compound"
      | "emergencyWithdraw"
      | "recoverEther"
      | "renounceOwnership"
      | "setGridQuantity"
      | "setGridStep"
      | "setMinFees"
      | "sweep"
      | "transferOwnership"
      | "withdraw",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[] = []
  ) => {
    try {
      const hash = await writeContract(config, {
        address: contractAddress as `0x${string}`,
        abi: GridPositionManagerABI,
        functionName,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        args,
      });
      toast(`Transaction Hash: ${hash}`);
      fetchPositions();
    } catch (error) {
      console.error(`Error executing ${functionName}:`, error);
    }
  };

  const handleDeposit = async (
    token0Amount: bigint,
    token1Amount: bigint,
    slippage: bigint
  ) => {
    await handleContractAction("deposit", [
      token0Amount,
      token1Amount,
      slippage,
    ]);
  };

  const handleWithdraw = async () => {
    await handleContractAction("withdraw");
  };

  const handleCompound = async (slippage: bigint) => {
    await handleContractAction("compound", [slippage]);
  };

  const handleSweep = async (slippage: bigint) => {
    await handleContractAction("sweep", [slippage]);
  };

  const handleClose = async () => {
    await handleContractAction("close");
  };

  const handleEmergencyWithdraw = async () => {
    await handleContractAction("emergencyWithdraw");
  };

  const handleSetMinFees = async (
    token0MinFees: bigint,
    token1MinFees: bigint
  ) => {
    await handleContractAction("setMinFees", [token0MinFees, token1MinFees]);
  };

  const handleSetGridQuantity = async (gridQuantity: bigint) => {
    await handleContractAction("setGridQuantity", [gridQuantity]);
  };

  const handleSetGridStep = async (gridStep: bigint) => {
    await handleContractAction("setGridStep", [gridStep]);
  };

  useEffect(() => {
    fetchPositions();
  }, [isConnected, address, fetchPositions]);

  const chartData = {
    labels: positions.map(
      (position) =>
        `Tick: ${position.tickLower} - ${position.tickUpper} (${position.priceLower.toFixed(
          2
        )} - ${position.priceUpper.toFixed(2)})`
    ),
    datasets: [
      {
        label: "Liquidity",
        data: positions.map((position) => Number(position.liquidityToken1)),
        backgroundColor: "rgba(75, 192, 192, 0.6)",
        borderColor: "rgba(75, 192, 192, 1)",
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) =>
            `Liquidity: ${context.raw.toLocaleString()}`,
        },
      },
      annotation: {
        annotations: {
          currentTickLine: {
            type: "line",
            scaleID: "x",
            value: pool
              ? positions.reduce((closestIndex, position, index) => {
                  const currentDiff = Math.abs(position.tickLower - pool.tick);
                  const closestDiff = Math.abs(
                    positions[closestIndex].tickLower - pool.tick
                  );
                  return currentDiff < closestDiff ? index : closestIndex;
                }, 0)
              : null,
            borderColor: "red",
            borderWidth: 2,
            label: {
              content: `"Current Tick ${pool?.tick} (${tickToPrice(pool?.tick, pool?.token0.decimals, pool?.token1.decimals)[0].toFixed(2)})"`,
              enabled: true,
              position: "end",
            },
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Position Range (PriceLower - PriceUpper)",
        },
      },
      y: {
        title: {
          display: true,
          text: "Liquidity",
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div>
      <h1>Manage Positions</h1>
      <h3>{contractAddress}</h3>
      {isConnected ? (
        <>
          <p>Connected Account: {address}</p>
          <button onClick={() => disconnect(config)}>Disconnect</button>
        </>
      ) : (
        <button
          onClick={() => connect(config, { connector: config.connectors[0] })}
        >
          Connect Wallet
        </button>
      )}
      <button onClick={fetchPositions}>Fetch Positions</button>
      <button
        onClick={() => handleDeposit(BigInt(1000), BigInt(1000), BigInt(100))}
      >
        Deposit
      </button>
      <button onClick={handleWithdraw}>Withdraw</button>
      <button onClick={() => handleCompound(BigInt(100))}>Compound</button>
      <button onClick={() => handleSweep(BigInt(100))}>Sweep</button>
      <button onClick={handleClose}>Close</button>
      <button onClick={handleEmergencyWithdraw}>Emergency Withdraw</button>
      <button onClick={() => handleSetMinFees(BigInt(10), BigInt(10))}>
        Set Min Fees
      </button>
      <button onClick={() => handleSetGridQuantity(BigInt(10))}>
        Set Grid Quantity
      </button>
      <button onClick={() => handleSetGridStep(BigInt(5))}>
        Set Grid Step
      </button>
      <div style={{ width: "100%", height: "400px", marginTop: "20px" }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
      <ul>
        {positions.map((position, index) => {
          return (
            <li key={index}>
              <p>Position {index + 1}:</p>
              {/* <p>Token ID: {position.tokenId.toString()}</p> */}
              <p>
                Lower Tick: {position.tickLower} (Price: {position.priceLower})
              </p>
              <p>
                Upper Tick: {position.tickUpper} (Price: {position.priceUpper})
              </p>
              <p>Liquidity: {position.liquidityToken1.toString()}</p>
              <p>Fees Token 0: {position.feesToken0.toString()}</p>
              <p>Fees Token 1: {position.feesToken1.toString()}</p>
            </li>
          );
        })}
      </ul>
      <ToastContainer />
    </div>
  );
};

export default ManagePositions;
