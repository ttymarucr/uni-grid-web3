import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { writeContract, multicall, simulateContract } from "@wagmi/core";
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
  useAppKit,
  useDisconnect,
  useAppKitAccount,
} from "@reown/appkit/react";
import { useForm } from "react-hook-form";

import {
  GridPositionManagerABI,
  IUniswapV3PoolABI,
  INonfungiblePositionManagerABI,
  IERC20MetadataABI,
} from "./abis";
import { config } from "./config";
import { GridPosition, PoolInfo, Position, TokenMetadata } from "./types";
import { maxUint128 } from "viem";
import {
  fromRawTokenAmount,
  liquidityToTokenAmounts,
  tickToPrice,
} from "./utils/uniswapUtils";
import Collapse from "./components/collapse/Collapse";

// Register Chart.js components to avoid re-registration issues
ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
  annotationPlugin
);

const ManagePositions: React.FC = () => {
  const NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS =
    "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
  const { contractAddress } = useParams<{ contractAddress: `0x${string}` }>();
  const { address, isConnected } = useAppKitAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [pool, setPool] = useState<PoolInfo>();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  const {
    register: registerDeposit,
    handleSubmit: handleSubmitDeposit,
    reset: resetDeposit,
  } = useForm();
  const {
    register: registerCompound,
    handleSubmit: handleSubmitCompound,
    reset: resetCompound,
  } = useForm();
  const {
    register: registerSweep,
    handleSubmit: handleSubmitSweep,
    reset: resetSweep,
  } = useForm();
  const {
    register: registerMinFees,
    handleSubmit: handleSubmitMinFees,
    reset: resetMinFees,
  } = useForm();
  const {
    register: registerGridQuantity,
    handleSubmit: handleSubmitGridQuantity,
    reset: resetGridQuantity,
  } = useForm();
  const {
    register: registerGridStep,
    handleSubmit: handleSubmitGridStep,
    reset: resetGridStep,
  } = useForm();

  const fetchPositions = useCallback(async () => {
    if (isConnected && address && contractAddress) {
      try {
        const [activeIndexes, poolAddress, totalPositions] = await multicall(
          config,
          {
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
          }
        );

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
              fee: slot0.result?.[4],
              tick: slot0.result?.[1],
            } as PoolInfo);
            toast("Positions fetched successfully");
          }
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
    }
  }, [address, isConnected, contractAddress]);

  const inRangePositionIndex = useCallback(() => {
    if (pool) {
      const positionIndex = positions.reduce(
        (closestIndex, position, index) => {
          const currentDiff = Math.abs(position.tickLower - pool.tick);
          const closestDiff = Math.abs(
            positions[closestIndex].tickLower - pool.tick
          );
          return currentDiff < closestDiff ? index : closestIndex;
        },
        0
      );
      const position = positions[positionIndex];
      return position.tickLower <= pool.tick && position.tickUpper >= pool.tick
        ? positionIndex
        : null;
    }
    return null;
  }, [pool, positions]);

  const liquidity = useCallback(
    () =>
      positions
        .reduce((sum, position) => sum + position.liquidityToken1, 0)
        .toFixed(2),
    [positions]
  );

  const totalFeesInToken1 = useCallback(() => {
    if (!pool) return "0.00";

    return positions
      .reduce((sum, position) => {
        const feesToken0InToken1 =
          Number(position.feesToken0) *
          tickToPrice(pool.tick, pool.token0.decimals, pool.token1.decimals)[0];
        return sum + feesToken0InToken1 + Number(position.feesToken1);
      }, 0)
      .toFixed(2);
  }, [positions, pool]);

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
        `Tick: ${position.tickLower} - ${
          position.tickUpper
        } (${position.priceLower.toFixed(2)} - ${position.priceUpper.toFixed(
          2
        )})`
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
          label: (context: any) => `Liquidity: ${context.raw.toLocaleString()}`,
        },
      },
      annotation: {
        annotations: {
          currentTickLine: {
            type: "line",
            scaleID: "x",
            value: inRangePositionIndex,
            borderColor: "red",
            borderWidth: 2,
            label: {
              content: `"Current Tick ${pool?.tick} (${tickToPrice(
                pool?.tick,
                pool?.token0.decimals,
                pool?.token1.decimals
              )[0].toFixed(2)})"`,
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
    <div className="m-20">
      <div className="grid grid-flow-col justify-items-stretch gap-4 text-lg font-semibold">
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">{`${contractAddress?.slice(
          0,
          6
        )}...${contractAddress?.slice(-4)}`}</div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Active Positions {positions.length}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          {inRangePositionIndex() ? "In Range" : "Not In Range"}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Liquidity {liquidity()}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Total Fees {totalFeesInToken1()}
        </div>
        <div className="rounded flex justify-center items-center">
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded mb-4"
            >
              {`${address?.slice(0, 6)}...${address?.slice(-4)} `}
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => open({ view: "Connect", namespace: "eip155" })}
              className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
      <div className="mb-4">
        {pool ? (
          <div>
            <h2 className="text-xl font-semibold">
              Pool{" "}
              <a
                href={`https://app.uniswap.org/explore/pools/base/${pool.address}`}
                className="text-blue-500 underline"
              >
                ({pool.token0.symbol}/{pool.token1.symbol})
              </a>{" "}
              {`${pool.fee / 10 ** 5}%`}
            </h2>
            <p>
              Current Price:{" "}
              {tickToPrice(
                pool.tick,
                pool.token0.decimals,
                pool.token1.decimals
              )[0].toFixed(2)}
            </p>
          </div>
        ) : (
          <p>No pool information available.</p>
        )}
      </div>
      <div className="w-full h-96 mb-4 grid grid-flow-col justify-items-center">
        <Bar data={chartData} options={chartOptions} />
      </div>
      <Collapse title="Actions">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <form
            onSubmit={handleSubmitDeposit((data) => {
              handleDeposit(
                BigInt(data.token0Amount),
                BigInt(data.token1Amount),
                BigInt(data.slippage)
              );
              resetDeposit();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Deposit</h3>
            <input
              {...registerDeposit("token0Amount")}
              type="number"
              placeholder="Token0 Amount"
              className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              {...registerDeposit("token1Amount")}
              type="number"
              placeholder="Token1 Amount"
              className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              {...registerDeposit("slippage")}
              type="number"
              placeholder="Slippage"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Deposit
            </button>
          </form>

          <form
            onSubmit={handleSubmitCompound((data) => {
              handleCompound(BigInt(data.slippage));
              resetCompound();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Compound</h3>
            <input
              {...registerCompound("slippage")}
              type="number"
              placeholder="Slippage"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Compound
            </button>
          </form>

          <form
            onSubmit={handleSubmitSweep((data) => {
              handleSweep(BigInt(data.slippage));
              resetSweep();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Sweep</h3>
            <input
              {...registerSweep("slippage")}
              type="number"
              placeholder="Slippage"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Sweep
            </button>
          </form>

          <form
            onSubmit={handleSubmitMinFees((data) => {
              handleSetMinFees(
                BigInt(data.token0MinFees),
                BigInt(data.token1MinFees)
              );
              resetMinFees();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Set Minimum Fees</h3>
            <input
              {...registerMinFees("token0MinFees")}
              type="number"
              placeholder="Token0 Min Fees"
              className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              {...registerMinFees("token1MinFees")}
              type="number"
              placeholder="Token1 Min Fees"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Set Min Fees
            </button>
          </form>

          <form
            onSubmit={handleSubmitGridQuantity((data) => {
              handleSetGridQuantity(BigInt(data.gridQuantity));
              resetGridQuantity();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Set Grid Quantity</h3>
            <input
              {...registerGridQuantity("gridQuantity")}
              type="number"
              placeholder="Grid Quantity"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Set Grid Quantity
            </button>
          </form>

          <form
            onSubmit={handleSubmitGridStep((data) => {
              handleSetGridStep(BigInt(data.gridStep));
              resetGridStep();
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-4">Set Grid Step</h3>
            <input
              {...registerGridStep("gridStep")}
              type="number"
              placeholder="Grid Step"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition"
            >
              Set Grid Step
            </button>
          </form>
        </div>
      </Collapse>
      <div>
        <div className="grid grid-cols-6 font-bold border-b-2 border-gray-300 pb-2 mb-2">
          <div>Position</div>
          <div>Lower Tick (Price)</div>
          <div>Upper Tick (Price)</div>
          <div>Liquidity ({pool?.token1.symbol})</div>
          <div>Fees {pool?.token0.symbol}</div>
          <div>Fees {pool?.token1.symbol}</div>
        </div>
        {positions.map((position, index) => {
          const isHighlighted =
            pool &&
            position.tickLower <= pool.tick &&
            position.tickUpper >= pool.tick;

          return (
            <div
              key={index}
              className={`grid grid-cols-6 border-b border-gray-200 py-2 ${
                isHighlighted ? "green-card" : ""
              }`}
            >
              <div>
                <a
                  href={`https://app.uniswap.org/positions/v3/base/${position.tokenId}`}
                  className="text-blue-500 underline"
                >
                  {position.tokenId.toString()}
                </a>
              </div>
              <div>
                {position.tickLower} ({position.priceLower.toFixed(2)})
              </div>
              <div>
                {position.tickUpper} ({position.priceUpper.toFixed(2)})
              </div>
              <div>{position.liquidityToken1.toFixed(2)}</div>
              <div>{position.feesToken0.toFixed(2)}</div>
              <div>{position.feesToken1.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
      <ToastContainer />
    </div>
  );
};

export default ManagePositions;
