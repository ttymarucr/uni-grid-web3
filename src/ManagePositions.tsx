import React, { useState, useEffect, useCallback, JSX } from "react";
import { Link, useParams } from "react-router-dom";
import {
  writeContract,
  multicall,
  simulateContract,
  readContract,
  estimateGas,
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
import { useAppKitAccount } from "@reown/appkit/react";
import { useForm } from "react-hook-form";

import {
  GridPositionManagerABI,
  IUniswapV3PoolABI,
  INonfungiblePositionManagerABI,
  IERC20MetadataABI,
} from "./abis";
import { config, deploymentContractsMap } from "./config";
import {
  DeploymentContract,
  GridPosition,
  GridState,
  PoolMetadata,
  Position,
  TokenMetadata,
} from "./types";
import { maxUint128 } from "viem";
import {
  fromRawTokenAmount,
  liquidityToTokenAmounts,
  tickToPrice,
  toRawTokenAmount,
} from "./utils/uniswapUtils";
import Collapse from "./components/collapse/Collapse";
import { useChainId } from "wagmi";

// Register Chart.js components to avoid re-registration issues
ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
  annotationPlugin
);

/**
 * Formats a number into the desired format: "0.0<sub>n</sub>rest"
 * for leading zeroes grater than 3.
 * @param value The number to format (e.g., 0.000008252987500408).
 * @returns A JSX element with the formatted value.
 */
function formatValue(value: number, decimals: number = 18): JSX.Element {
  const valueStr = value.toFixed(decimals); // Convert the number to a string
  const parts = valueStr.split("."); // Split into integer and fractional parts

  if (parts.length < 2) {
    return <span>{valueStr}</span>; // If no fractional part, return as is
  }

  const fractionalPart = parts[1];
  const leadingZeros = fractionalPart.match(/^0+/)?.[0]?.length || 0; // Count leading zeros
  if (4 > leadingZeros) {
    return <span>{valueStr}</span>; // Less than 3 leading zeros, return as is
  } else if (leadingZeros === decimals) {
    return <span>0</span>;
  }
  const significantDigits = fractionalPart.slice(leadingZeros); // Get the rest of the digits

  return (
    <span>
      0.0<sub>{leadingZeros}</sub>
      {significantDigits}
    </span>
  );
}

const ManagePositions: React.FC = () => {
  const { contractAddress } = useParams<{ contractAddress: `0x${string}` }>();
  const { address, isConnected } = useAppKitAccount();
  const [deploymentContracts, setDeploymentContracts] =
      useState<DeploymentContract>({} as DeploymentContract);
  const [positions, setPositions] = useState<Position[]>([]);
  const [gridState, setGridState] = useState<GridState>({
    token0MinFees: 0n,
    token1MinFees: 0n,
    token0Liquidity: 0n,
    token1Liquidity: 0n,
    isInRange: false,
    gridStep: 0n,
    gridQuantity: 0n,
  });
  const [pool, setPool] = useState<PoolMetadata>({
    address: "0x00",
    token0: { address: "", symbol: "", decimals: 0 },
    token1: { address: "", symbol: "", decimals: 0 },
    fee: 0,
    tick: 0,
  });

  const chainId = useChainId({config});

  const {
    register: registerDeposit,
    handleSubmit: handleSubmitDeposit,
    reset: resetDeposit,
    getValues: getValuesDeposit,
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
    if (isConnected && address && contractAddress && deploymentContracts.uniswapV3PositionManager) {
      try {
        const [
          activePositionsResponse,
          poolInfoResponse,
          isInRangeResponse,
          liquidityResponse,
        ] = await multicall(config, {
          contracts: [
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getActivePositions",
            },
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getPoolInfo",
            },
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "isInRange",
            },
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "getLiquidity",
            },
          ],
        });
        if (
          activePositionsResponse.status == "success" &&
          poolInfoResponse.status == "success"
        ) {
          const poolInfo = poolInfoResponse.result;
          const gridPositions: GridPosition[] =
            activePositionsResponse.result.map(
              (result) => result as GridPosition
            );

          const slot0 = await readContract(config, {
            address: poolInfo.pool,
            abi: IUniswapV3PoolABI,
            functionName: "slot0",
          });
          const token0Meta = {
            address: poolInfo.token0,
            symbol: poolInfo.token0Symbol,
            decimals: poolInfo.token0Decimals,
          } as TokenMetadata;
          const token1Meta = {
            address: poolInfo.token1,
            symbol: poolInfo.token1Symbol,
            decimals: poolInfo.token1Decimals,
          } as TokenMetadata;

          const poolFees = gridPositions.map((position) =>
            simulateContract(config, {
              address: deploymentContracts.uniswapV3PositionManager,
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
              if (result && request.args) {
                acc[Number(request.args[0].tokenId)] = result;
              }
              return acc;
            },
            {} as Record<number, [bigint, bigint]>
          );

          const positionsWithFees: Position[] = gridPositions.map(
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
                feesToken0: fromRawTokenAmount(feesToken0, token0Meta.decimals),
                feesToken1: fromRawTokenAmount(feesToken1, token1Meta.decimals),
                liquidityToken0: liq.amount0,
                liquidityToken1: liq.amount1,
              };
            }
          );
          setPositions(
            positionsWithFees.sort((a, b) => a.tickLower - b.tickLower)
          );
          setPool({
            address: poolInfo.pool,
            token0: token0Meta,
            token1: token1Meta,
            fee: slot0?.[4],
            tick: slot0?.[1],
          } as PoolMetadata);
          setGridState({
            token0MinFees: poolInfo.token0MinFees,
            token1MinFees: poolInfo.token1MinFees,
            gridQuantity: poolInfo.gridQuantity,
            gridStep: poolInfo.gridStep,
            token0Liquidity:
              liquidityResponse.status == "success"
                ? liquidityResponse.result[0]
                : 0n,
            token1Liquidity:
              liquidityResponse.status == "success"
                ? liquidityResponse.result[1]
                : 0n,
            isInRange:
              isInRangeResponse.status == "success"
                ? isInRangeResponse.result
                : false,
          });
          toast("Positions fetched successfully");
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
    }
  }, [isConnected, address, contractAddress, deploymentContracts.uniswapV3PositionManager]);

  const fetchTokenBalance = async (tokenAddress: string) => {
    if (!address || !isConnected) {
      toast.error("Please connect your wallet.");
      return 0n;
    }
    try {
      const balance = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: IERC20MetadataABI,
        functionName: "balanceOf",
        args: [address],
      });
      return balance as bigint;
    } catch (error) {
      toast.error("Error fetching token balance.");
      console.error("Error fetching token balance:", error);
      return 0n;
    }
  };

  const inRangePositionIndex = useCallback(
    () =>
      positions.findIndex(
        (position) =>
          position.tickLower <= pool.tick && position.tickUpper >= pool.tick
      ),
    [pool, positions]
  );

  const liquidity = useCallback(
    () =>
      fromRawTokenAmount(gridState.token0Liquidity, pool.token0.decimals) *
        tickToPrice(pool.tick, pool.token0.decimals, pool.token1.decimals)[0] +
      fromRawTokenAmount(gridState.token1Liquidity, pool.token1.decimals),
    [
      gridState.token0Liquidity,
      gridState.token1Liquidity,
      pool.tick,
      pool.token0.decimals,
      pool.token1.decimals,
    ]
  );

  const totalFees = useCallback(() => {
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
      const eGas = await estimateGas(config, {
        address: contractAddress as `0x${string}`,
        abi: GridPositionManagerABI,
        functionName,
        args,
        account: address,
      });
      const hash = await writeContract(config, {
        address: contractAddress as `0x${string}`,
        abi: GridPositionManagerABI,
        functionName,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        args,
        gas: eGas,
      });
      toast(`Transaction Hash: ${hash}`);
      fetchPositions();
    } catch (error) {
      toast.error(
        `Error executing ${functionName}: ${(error as Error).message}`
      );
      console.error(`Error executing ${functionName}:`, error);
    }
  };

  const handleDeposit = async (
    token0Amount: number,
    token1Amount: number,
    slippage: number,
    gridType: number
  ) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    await handleContractAction("deposit", [
      toRawTokenAmount(token0Amount, pool.token0.decimals),
      toRawTokenAmount(token1Amount, pool.token1.decimals),
      slippage * 100,
      gridType,
    ]);
    resetDeposit();
  };

  const handleWithdraw = async () => {
    await handleContractAction("withdraw");
  };

  const handleCompound = async (slippage: number, gridType: number) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    await handleContractAction("compound", [slippage * 100, gridType]);
    resetCompound();
  };

  const handleSweep = async (slippage: number, gridType: number) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    await handleContractAction("sweep", [slippage * 100, gridType]);
    resetSweep();
  };

  const handleClose = async () => {
    await handleContractAction("close");
  };

  const handleSetMinFees = async (
    token0MinFees: number,
    token1MinFees: number
  ) => {
    await handleContractAction("setMinFees", [
      toRawTokenAmount(token0MinFees, pool.token0.decimals),
      toRawTokenAmount(token1MinFees, pool.token1.decimals),
    ]);
    resetMinFees();
  };

  const handleSetGridQuantity = async (gridQuantity: bigint) => {
    await handleContractAction("setGridQuantity", [gridQuantity]);
    resetGridQuantity();
  };

  const handleSetGridStep = async (gridStep: bigint) => {
    await handleContractAction("setGridStep", [gridStep]);
    resetGridStep();
  };

  const handleTokenApprove = async (
    tokenAddress: string,
    amount: number,
    decimals: number
  ) => {
    try {
      await writeContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: IERC20MetadataABI,
        functionName: "approve",
        args: [contractAddress, toRawTokenAmount(amount, decimals)],
      });
      toast.success("Token approved successfully.");
    } catch (error) {
      toast.error("Error approving token.");
      console.error("Error approving token:", error);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [isConnected, address, fetchPositions]);

  useEffect(() => {
    if (gridState) {
      resetGridQuantity({
        gridQuantity: gridState.gridQuantity.toString(),
      });
      resetGridStep({
        gridStep: gridState.gridStep.toString(),
      });
    }
  }, [gridState, resetGridQuantity, resetGridStep]);

  useEffect(() => {
      if(chainId){ 
        setDeploymentContracts(deploymentContractsMap[chainId]);
      }
    }
    , [chainId]);

  const chartData = {
    labels: positions.map(
      (position) =>
        `${position.priceLower.toFixed(2)} - ${position.priceUpper.toFixed(
          2
        )}`
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
              content: `"${tickToPrice(
                pool.tick || 0,
                pool.token0.decimals || 18,
                pool.token1.decimals || 18
              )[0].toFixed(2)}"`,
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
          text: `Liquidity (${pool.token1.symbol})`,
        },
        beginAtZero: true,
      },
    },
  };
  return (
    <div className="md:m-10 m-2">
      <div className="grid md:grid-flow-col grid-flow-row justify-items-stretch gap-4 md:text-lg text-sm font-semibold">
        <Link to="/">
          <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
            &#12296;
          </div>
        </Link>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">{`${contractAddress?.slice(
          0,
          6
        )}...${contractAddress?.slice(-4)}`}</div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Active Positions {positions.length}
        </div>
        <div
          className={`${
            inRangePositionIndex() ? "green-card" : "bg-red-900"
          } rounded flex justify-center items-center mb-4 px-4 py-2`}
        >
          {gridState.isInRange ? "In Range" : "Not In Range"}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Liquidity {liquidity().toFixed(2)}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Total Fees {totalFees()}
        </div>
      </div>
      <div className="mb-4">
        {pool ? (
          <div>
            <h2 className="text-xl font-semibold">
              Pool{" "}
              <a
                href={`https://app.uniswap.org/explore/pools/base/${pool.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                ({pool.token0.symbol}/{pool.token1.symbol})
              </a>{" "}
              {`${pool.fee / 10 ** 5}%`}
              <div className="flex float-right text-sm font-normal">
              <button
          onClick={fetchPositions}
          className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md mb-4 hover:cursor-pointer"
        >
          Refresh
        </button>
              </div>
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
                data.token0Amount,
                data.token1Amount,
                data.slippage,
                Number(data.gridType)
              );
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Deposit</h3>
            <p className="text-sm text-gray-600 mb-4">
              Add liquidity to the grid positions by specifying token amounts,
              slippage, and grid type.
            </p>
            <div className="flex items-center mb-2">
              <input
                {...registerDeposit("token0Amount")}
                type="number"
                min={0}
                step={1 / 10 ** (pool.token0.decimals || 18)}
                placeholder={`${pool.token0.symbol} Amount`}
                className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={async () => {
                  const token0Balance = await fetchTokenBalance(
                    pool.token0.address || "0x00"
                  );
                  const token1Balance = await fetchTokenBalance(
                    pool.token1.address || "0x00"
                  );
                  resetDeposit({
                    token0Amount: fromRawTokenAmount(
                      token0Balance,
                      pool.token0.decimals
                    ).toFixed(pool.token0.decimals),
                    token1Amount: fromRawTokenAmount(
                      token1Balance,
                      pool.token1.decimals
                    ).toFixed(pool.token1.decimals),
                    slippage: 0.1,
                  });
                }}
                className="ml-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md hover:cursor-pointer"
              >
                Max
              </button>
              <button
                type="button"
                onClick={() => {
                  const { token0Amount } = getValuesDeposit();
                  handleTokenApprove(
                    pool.token0.address || "0x00",
                    token0Amount,
                    pool.token0.decimals
                  );
                }}
                className="ml-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md hover:cursor-pointer"
              >
                Approve
              </button>
            </div>
            <div className="flex items-center mb-2">
              <input
                {...registerDeposit("token1Amount")}
                type="number"
                min={0}
                step={1 / 10 ** (pool.token1.decimals || 18)}
                placeholder={`${pool.token1.symbol} Amount`}
                className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={async () => {
                  const token0Balance = await fetchTokenBalance(
                    pool.token0.address || "0x00"
                  );
                  const token1Balance = await fetchTokenBalance(
                    pool.token1.address || "0x00"
                  );
                  resetDeposit({
                    token0Amount: fromRawTokenAmount(
                      token0Balance,
                      pool.token0.decimals
                    ).toFixed(pool.token0.decimals),
                    token1Amount: fromRawTokenAmount(
                      token1Balance,
                      pool.token1.decimals
                    ).toFixed(pool.token1.decimals),
                    slippage: 0.1,
                  });
                }}
                className="ml-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md hover:cursor-pointer"
              >
                Max
              </button>
              <button
                type="button"
                onClick={() => {
                  const { token1Amount } = getValuesDeposit();
                  handleTokenApprove(
                    pool.token1.address || "0x00",
                    token1Amount,
                    pool.token1.decimals
                  );
                }}
                className="ml-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-md hover:cursor-pointer"
              >
                Approve
              </button>
            </div>
            <input
              {...registerDeposit("slippage")}
              type="number"
              placeholder="Slippage (max 5%)"
              step={0.01}
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="mb-4">
              <label className="block font-semibold mb-2">Position</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    {...registerDeposit("gridType")}
                    type="radio"
                    value="1"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-teal-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Buy
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerDeposit("gridType")}
                    type="radio"
                    value="0"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-gray-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Neutral
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerDeposit("gridType")}
                    type="radio"
                    value="2"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-red-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Sell
                  </div>
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Deposit
            </button>
          </form>

          <form
            onSubmit={handleSubmitCompound((data) => {
              handleCompound(data.slippage, Number(data.gridType));
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Compound</h3>
            <p className="text-sm text-gray-600 mb-4">
              Reinvest collected fees into the closest active position.
            </p>
            <input
              {...registerCompound("slippage")}
              type="number"
              placeholder="Slippage (max 5%)"
              step={0.01}
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="mb-4">
              <label className="block font-semibold mb-2">Position</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    {...registerCompound("gridType")}
                    type="radio"
                    value="1"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-teal-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Buy
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerCompound("gridType")}
                    type="radio"
                    value="0"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-gray-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Neutral
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerCompound("gridType")}
                    type="radio"
                    value="2"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-red-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Sell
                  </div>
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Compound
            </button>
          </form>

          <form
            onSubmit={handleSubmitSweep((data) => {
              handleSweep(data.slippage, Number(data.gridType));
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Sweep</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove liquidity from positions outside the price range and
              redeposit tokens.
            </p>
            <input
              {...registerSweep("slippage")}
              type="number"
              placeholder="Slippage (max 5%)"
              step={0.01}
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="mb-4">
              <label className="block font-semibold mb-2">Position</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    {...registerSweep("gridType")}
                    type="radio"
                    value="1"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-teal-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Buy
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerSweep("gridType")}
                    type="radio"
                    value="0"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-gray-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Neutral
                  </div>
                </label>
                <label className="flex-1">
                  <input
                    {...registerSweep("gridType")}
                    type="radio"
                    value="2"
                    className="hidden peer"
                  />
                  <div className="peer-checked:bg-red-500 peer-checked:text-white border border-gray-300 rounded-md text-center py-2 cursor-pointer hover:bg-gray-100 hover:text-black">
                    Sell
                  </div>
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Sweep
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleWithdraw();
            }}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Withdraw</h3>
            <p className="text-sm text-gray-600 mb-4">
              Withdraw all liquidity from the grid positions.
            </p>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Withdraw
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleClose();
            }}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Close</h3>
            <p className="text-sm text-gray-600 mb-4">
              Close all active positions in the grid.
            </p>
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Close
            </button>
          </form>

          <form
            onSubmit={handleSubmitMinFees((data) => {
              handleSetMinFees(data.token0MinFees, data.token1MinFees);
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Set Minimum Fees</h3>
            <p className="text-sm text-gray-600 mb-4">
              Define the minimum fees required for token0 and token1 before
              compounding.
            </p>
            <input
              {...registerMinFees("token0MinFees")}
              type="number"
              step={1 / 10 ** (pool.token0.decimals || 18)}
              placeholder={`${pool.token0.symbol} Minimum Fees`}
              className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              {...registerMinFees("token1MinFees")}
              type="number"
              step={1 / 10 ** (pool.token1.decimals || 18)}
              placeholder={`${pool.token1.symbol} Minimum Fees`}
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Set Minimum Fees
            </button>
          </form>

          <form
            onSubmit={handleSubmitGridQuantity((data) => {
              handleSetGridQuantity(BigInt(data.gridQuantity));
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Set Grid Quantity</h3>
            <p className="text-sm text-gray-600 mb-4">
              Adjust the total number of grid positions for liquidity
              management.
            </p>
            <input
              {...registerGridQuantity("gridQuantity")}
              type="number"
              placeholder="Grid Quantity"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Set Grid Quantity
            </button>
          </form>

          <form
            onSubmit={handleSubmitGridStep((data) => {
              handleSetGridStep(BigInt(data.gridStep));
            })}
            className="green-card rounded-lg shadow-md p-4"
          >
            <h3 className="font-semibold text-lg mb-2">Set Grid Step</h3>
            <p className="text-sm text-gray-600 mb-4">
              Modify the step size between grid positions for liquidity
              allocation.
            </p>
            <input
              {...registerGridStep("gridStep")}
              type="number"
              placeholder="Grid Step"
              className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-md transition hover:cursor-pointer"
            >
              Set Grid Step
            </button>
          </form>
        </div>
      </Collapse>
      <div>
        <div className="grid grid-cols-4 font-bold border-b-2 border-gray-300 pb-2 mb-2">
          <div>Position</div>
          <div>Price Range</div>
          <div>Liquidity ({pool.token1.symbol})</div>
          <div>Uncollected Fees</div>
        </div>
        {positions.map((position, index) => {
          const isHighlighted =
            pool &&
            position.tickLower <= pool.tick &&
            position.tickUpper >= pool.tick;

          return (
            <div
              key={index}
              className={`grid grid-cols-4 border-b border-gray-200 py-2 ${
                isHighlighted ? "green-card" : ""
              }`}
            >
              <div>
                <a
                  href={`https://app.uniswap.org/positions/v3/base/${position.tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {position.tokenId.toString()}
                </a>
              </div>
              <div>
                {position.priceLower.toFixed(2)}{" "}-{" "}
                {position.priceUpper.toFixed(2)}
              </div>
              <div>{position.liquidityToken1.toFixed(2)}</div>
              <div>
                <p className="truncate">{formatValue(position.feesToken0, pool.token0.decimals)} {pool.token0.symbol}</p>
                <p className="truncate">{formatValue(position.feesToken1, pool.token1.decimals)} {pool.token1.symbol}</p>
              </div>
            </div>
          );
        })}
      </div>
      <ToastContainer />
    </div>
  );
};

export default ManagePositions;
