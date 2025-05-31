import React, { useState, useEffect, useCallback, JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  writeContract,
  multicall,
  simulateContract,
  readContract,
  estimateGas,
  getPublicClient,
  getBlock,
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
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import {
  formatUnits,
  parseUnits,
  maxUint128,
  parseAbi,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
} from "viem";
import { useChainId } from "wagmi";
import { ArrowPathIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import {
  GridPositionManagerABI,
  IUniswapV3PoolABI,
  INonfungiblePositionManagerABI,
  IERC20MetadataABI,
  ErrorCodeMessages,
} from "../abis";
import { config, deploymentConfigMap } from "../config";
import {
  DeploymentConfig,
  GridPosition,
  GridState,
  PoolInfo,
  PoolMetadata,
  Position,
  TokenMetadata,
} from "../types";
import { liquidityToTokenAmounts, tickToPrice } from "../utils/uniswapUtils";
import Collapse from "../components/Collapse";
import Button from "../components/Button";
import { DistributionType } from "../components/DistributionType";
import { GridType } from "../components/GridType";
import { getLogs } from "viem/actions"; // Import getLogs from viem/actions

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
  const valueStr = value >= 1 ? value.toFixed(4) : value.toFixed(decimals); // Convert the number to a string
  const parts = valueStr.split("."); // Split into integer and fractional parts

  if (parts.length < 2) {
    return <span>{valueStr}</span>; // If no fractional part, return as is
  }

  const fractionalPart = parts[1];
  const leadingZeros = fractionalPart.match(/^0+/)?.[0]?.length || 0; // Count leading zeros
  if (4 >= leadingZeros) {
    return <span>{valueStr}</span>; // Less than 4 leading zeros, return as is
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
  const client = getPublicClient(config);
  const { address, isConnected } = useAppKitAccount();
  const [deploymentContracts, setDeploymentContracts] =
    useState<DeploymentConfig>({} as DeploymentConfig);
  const [owner, setOwner] = useState<string>();
  const [positions, setPositions] = useState<Position[]>([]);
  const [gridState, setGridState] = useState<GridState>({
    token0MinFees: 0n,
    token1MinFees: 0n,
    token0Liquidity: 0n,
    token1Liquidity: 0n,
    isInRange: true,
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
  const [gridBalance, setGridBalance] = useState<number[]>([0, 0]);

  const chainId = useChainId({ config });
  const navigate = useNavigate();

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
  const {
    register: registerAddLiquidityToPosition,
    handleSubmit: handleSubmitAddLiquidityToPosition,
    reset: resetAddLiquidityToPosition,
    getValues: getValuesAddLiquidityToPosition,
  } = useForm();

  const [displayInToken0, setDisplayInToken0] = useState(false);

  const toggleDisplayToken = () => {
    setDisplayInToken0((prev) => !prev);
  };

  const historyQuery = useCallback(async () => {
    if (contractAddress) {
      try {
        const block = await getBlock(config, {
          chainId: chainId,
        });
        const logs = await getLogs(client, {
          address: contractAddress as `0x${string}`,
          events: parseAbi([
            "event GridDeposit(address indexed owner, uint256 token0Amount, uint256 token1Amount)",
            "event Withdraw(address indexed owner, uint256 token0Amount, uint256 token1Amount)",
            "event Compound(address indexed owner, uint256 token0Amount, uint256 token1Amount)",
          ]),
          // historical data is limited per node service
          fromBlock: BigInt(block.number) - 500n,
        });

        const groupedLogs = logs.reduce((acc, log) => {
          const blockNumber: string = log.blockNumber.toString();
          if (!acc[blockNumber]) {
            acc[blockNumber] = {
              blockNumber,
              event: log.eventName,
              token0Amount: 0n,
              token1Amount: 0n,
              timestamp: "",
              owner: `${log.args.owner?.slice(0, 6)}...${log.args.owner?.slice(
                -4
              )}`,
            };
          }
          acc[blockNumber].token0Amount += log.args.token0Amount || 0n;
          acc[blockNumber].token1Amount += log.args.token1Amount || 0n;
          return acc;
        }, {} as Record<string, { blockNumber: string; timestamp: string; token0Amount: bigint; token1Amount: bigint; owner: string; event: string }>);

        const logPromises = await Promise.all(
          Object.values(groupedLogs).map(async (log) => {
            const block = await client.getBlock({
              blockNumber: BigInt(log.blockNumber),
            });
            return {
              ...log,
              timestamp: new Date(
                Number(block.timestamp) * 1000
              ).toLocaleString(),
            };
          })
        );
        return logPromises.sort(
          (a, b) => Number(b.blockNumber) - Number(a.blockNumber)
        );
      } catch (error) {
        console.error("Error fetching history:", error);
      }
    }
  }, [chainId, client, contractAddress]);

  const {
    data: history,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["history", isConnected, address],
    queryFn: historyQuery,
  });

  const fetchPositions = useCallback(async () => {
    if (
      isConnected &&
      address &&
      contractAddress &&
      deploymentContracts.uniswapV3PositionManager
    ) {
      try {
        const [
          activePositionsResponse,
          poolInfoResponse,
          isInRangeResponse,
          liquidityResponse,
          ownerResponse,
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
            {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: "owner",
            },
          ],
        });
        if (
          activePositionsResponse.status == "success" &&
          poolInfoResponse.status == "success"
        ) {
          const poolInfo: PoolInfo = poolInfoResponse.result as PoolInfo;
          const gridPositions: GridPosition[] =
            activePositionsResponse.result as GridPosition[];

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
                  token1Meta.decimals,
                  token0Meta.decimals
                )[displayInToken0 ? 1 : 0],
                priceUpper: tickToPrice(
                  position.tickUpper,
                  token1Meta.decimals,
                  token0Meta.decimals
                )[displayInToken0 ? 1 : 0],
                feesToken0: Number(
                  formatUnits(feesToken0, token0Meta.decimals)
                ),
                feesToken1: Number(
                  formatUnits(feesToken1, token1Meta.decimals)
                ),
                liquidityToken0: liq.amount0,
                liquidityToken1: liq.amount1,
              };
            }
          );
          if (ownerResponse.status == "success") {
            const owner = ownerResponse.result as string;
            setOwner(owner);
          }
          setPositions(
            positionsWithFees.sort((a, b) =>
              displayInToken0
                ? a.priceLower - b.priceLower
                : a.priceUpper - b.priceUpper
            )
          );
          setPool({
            address: poolInfo.pool,
            token0: token0Meta,
            token1: token1Meta,
            fee: poolInfo.fee,
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
                ? (isInRangeResponse.result as boolean)
                : false,
          });
          toast("Positions fetched successfully");
        }
      } catch (error) {
        console.error("Error fetching positions:", error);
      }
    }
  }, [
    isConnected,
    address,
    contractAddress,
    deploymentContracts.uniswapV3PositionManager,
    displayInToken0,
  ]);

  const fetchTokenBalance = async (tokenAddress?: string, account?: string) => {
    if (!account || !tokenAddress) {
      return 0n;
    }
    try {
      const balance = await readContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: IERC20MetadataABI,
        functionName: "balanceOf",
        args: [account],
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
          position.tickLower <= pool.tick && position.tickUpper > pool.tick
      ),
    [pool, positions]
  );

  const liquidity = useCallback(
    () =>
      displayInToken0
        ? Number(formatUnits(gridState.token1Liquidity, pool.token1.decimals)) *
            tickToPrice(
              pool.tick,
              pool.token1.decimals,
              pool.token0.decimals
            )[1] +
          Number(formatUnits(gridState.token0Liquidity, pool.token0.decimals))
        : Number(formatUnits(gridState.token0Liquidity, pool.token0.decimals)) *
            tickToPrice(
              pool.tick,
              pool.token1.decimals,
              pool.token0.decimals
            )[0] +
          Number(formatUnits(gridState.token1Liquidity, pool.token1.decimals)),
    [
      displayInToken0,
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
        const [token0Fees, token1Fees] = displayInToken0
          ? [position.feesToken0, position.feesToken1]
          : [position.feesToken1, position.feesToken0];
        const feesToken0InToken1 =
          Number(token1Fees) *
          tickToPrice(pool.tick, pool.token1.decimals, pool.token0.decimals)[
            displayInToken0 ? 1 : 0
          ];
        return sum + feesToken0InToken1 + Number(token0Fees);
      }, 0)
      .toFixed(4);
  }, [
    positions,
    displayInToken0,
    pool.tick,
    pool.token0.decimals,
    pool.token1.decimals,
  ]);

  const handleContractAction = async (
    functionName:
      | "deposit"
      | "compound"
      | "recoverEther"
      | "renounceOwnership"
      | "setGridQuantity"
      | "setGridStep"
      | "setMinFees"
      | "sweep"
      | "transferOwnership"
      | "withdraw"
      | "withdrawAvailable"
      | "addLiquidityToPosition",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[] = []
  ) => {
    try {
      try {
        await simulateContract(config, {
          address: contractAddress as `0x${string}`,
          abi: GridPositionManagerABI,
          functionName,
          args,
          account: address as `0x${string}`,
        });
      } catch (err) {
        if (err instanceof ContractFunctionExecutionError) {
          console.error("Simulation error:", err);
        } else {
          if (err instanceof BaseError) {
            const revertError = err.walk(
              (err) => err instanceof ContractFunctionRevertedError
            );
            if (revertError instanceof ContractFunctionRevertedError) {
              const errorName = revertError.data?.args?.[0] ?? "";
              const message = ErrorCodeMessages[errorName];
              if (message) {
                toast.error(`Error: ${message}`);
              } else {
                toast.error(`Error: ${errorName}`);
              }
            } else {
              toast.error("Error: " + err.message);
              console.error("Error:", err);
            }
          }
          return;
        }
      }
      const eGas = await estimateGas(config, {
        address: contractAddress as `0x${string}`,
        abi: GridPositionManagerABI,
        functionName,
        args,
        account: address as `0x${string}`,
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
      const tx = await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      if (tx && tx.status !== "success") {
        toast.error("Transaction failed.");
        return;
      }
      toast.success(`Transaction ${functionName} executed successfully.`);
      fetchPositions();
      refetchHistory();
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
    gridType: number,
    distributionType: number
  ) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    if (
      !Number.isInteger(distributionType) ||
      ![0, 1, 2, 3, 4, 5].includes(distributionType)
    ) {
      toast.error("Select a Distribution Type");
      return;
    }
    await handleContractAction("deposit", [
      parseUnits(token0Amount.toString(), pool.token0.decimals),
      parseUnits(token1Amount.toString(), pool.token1.decimals),
      slippage * 100,
      gridType,
      distributionType,
    ]);
    resetDeposit();
  };

  const handleWithdraw = async () => {
    await handleContractAction("withdraw");
  };

  const handleWithdrawAvailable = async () => {
    await handleContractAction("withdrawAvailable");
  };

  const handleCompound = async (
    slippage: number,
    gridType: number,
    distributionType: number
  ) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    if (
      !Number.isInteger(distributionType) ||
      ![0, 1, 2, 3, 4, 5].includes(distributionType)
    ) {
      toast.error("Select a Distribution Type");
      return;
    }
    await handleContractAction("compound", [
      slippage * 100,
      gridType,
      distributionType,
    ]);
    resetCompound();
  };

  const handleSweep = async (
    slippage: number,
    gridType: number,
    distributionType: number
  ) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    if (!Number.isInteger(gridType) || ![0, 1, 2].includes(gridType)) {
      toast.error("Select a Position, Buy, Neutral or Sell");
      return;
    }
    if (
      !Number.isInteger(distributionType) ||
      ![0, 1, 2, 3, 4, 5].includes(distributionType)
    ) {
      toast.error("Select a Distribution Type");
      return;
    }
    await handleContractAction("sweep", [
      slippage * 100,
      gridType,
      distributionType,
    ]);
    resetSweep();
  };

  const handleSetMinFees = async (
    token0MinFees: number,
    token1MinFees: number
  ) => {
    await handleContractAction("setMinFees", [
      parseUnits(token0MinFees.toString(), pool.token0.decimals),
      parseUnits(token1MinFees.toString(), pool.token1.decimals),
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

  const handleAddLiquidityToPosition = async (
    token0Amount: number,
    token1Amount: number,
    slippage: number,
    tokenId: number
  ) => {
    if (Number(slippage) > 5) {
      toast.error("Slippage cannot exceed 500 basis points (max 5%)");
      return;
    }
    const position = positions.find(
      (position) => position.tokenId === BigInt(tokenId)
    );
    if (!position) {
      toast.error("Position not found.");
      return;
    }

    await handleContractAction("addLiquidityToPosition", [
      tokenId,
      slippage * 100,
      parseUnits(token0Amount.toString(), pool.token0.decimals),
      parseUnits(token1Amount.toString(), pool.token1.decimals),
    ]);
    resetAddLiquidityToPosition();
  };

  const handleTokenApprove = async (
    tokenAddress: string,
    amount: number,
    decimals: number
  ) => {
    try {
      const hash = await writeContract(config, {
        address: tokenAddress as `0x${string}`,
        abi: IERC20MetadataABI,
        functionName: "approve",
        args: [contractAddress, parseUnits(amount.toString(), decimals)],
      });
      await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      toast.success("Token approved successfully.");
    } catch (error) {
      toast.error("Error approving token.");
      console.error("Error approving token:", error);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    const fetchGridBalance = async () => {
      if (pool.token0.address && pool.token1.address && contractAddress) {
        const token0Balance = await fetchTokenBalance(
          pool.token0.address,
          contractAddress
        );
        const token1Balance = await fetchTokenBalance(
          pool.token1.address,
          contractAddress
        );
        setGridBalance([
          Number(formatUnits(token0Balance, pool.token0.decimals)),
          Number(formatUnits(token1Balance, pool.token1.decimals)),
        ]);
      }
    };

    fetchGridBalance();
  }, [
    contractAddress,
    pool.token0.address,
    pool.token0.decimals,
    pool.token1.address,
    pool.token1.decimals,
    positions,
  ]);

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
    if (chainId) {
      setDeploymentContracts(deploymentConfigMap[chainId]);
    }
  }, [chainId]);

  const chartData = React.useMemo(
    () => ({
      labels: positions.map(
        (position) =>
          `${
            position.priceLower > 1
              ? position.priceLower.toFixed(4)
              : position.priceLower.toFixed(
                  displayInToken0 ? pool.token0.decimals : pool.token1.decimals
                )
          } - ${
            position.priceUpper > 1
              ? position.priceUpper.toFixed(4)
              : position.priceUpper.toFixed(
                  displayInToken0 ? pool.token0.decimals : pool.token1.decimals
                )
          }`
      ),
      datasets: [
        {
          label: "Liquidity",
          data: positions.map((position) =>
            Number(
              displayInToken0
                ? position.liquidityToken0
                : position.liquidityToken1
            )
          ),
          backgroundColor: "rgba(75, 192, 192, 0.6)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    }),
    [positions, displayInToken0, pool.token0.decimals, pool.token1.decimals]
  );

  const chartOptions = React.useMemo(
    () => ({
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
              value: inRangePositionIndex,
              borderColor: "red",
              borderWidth: 2,
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
            text: `Liquidity (${
              displayInToken0 ? pool.token0.symbol : pool.token1.symbol
            })`,
          },
          beginAtZero: true,
        },
      },
    }),
    [
      inRangePositionIndex,
      displayInToken0,
      pool.token0.symbol,
      pool.token1.symbol,
    ]
  );

  return (
    <div className="m-2 md:m-10">
      <div className="grid md:grid-flow-col grid-flow-row justify-items-stretch md:gap-4 gap-0 md:text-lg text-sm font-semibold">
        <div
          className="green-card rounded flex justify-center items-center mb-4 px-4 py-2 hover:cursor-pointer"
          onClick={() => navigate("/")}
        >
          <ChevronLeftIcon className="md:w-7 w-5" />
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Active Positions {positions.length}
        </div>
        <div
          className={`${
            gridState.isInRange ? "green-card" : "bg-red-900"
          } rounded flex justify-center items-center mb-4 px-4 py-2`}
        >
          {gridState.isInRange ? "In Range" : "Not In Range"}
        </div>
        <div className="green-card rounded flex justify-center items-center gap-2 mb-4 px-4 py-2">
          Liquidity
          {formatValue(
            liquidity(),
            displayInToken0 ? pool.token0.decimals : pool.token1.decimals
          )}{" "}
          {displayInToken0 ? pool.token0.symbol : pool.token1.symbol}
        </div>
        <div className="green-card rounded flex justify-center items-center mb-4 px-4 py-2">
          Total Fees {totalFees()}{" "}
          {displayInToken0 ? pool.token0.symbol : pool.token1.symbol}
        </div>
      </div>
      <div className="mb-4">
        {pool ? (
          <div>
            <h2 className="text-xl font-semibold">
              Pool{" ("}
              <a
                href={`https://app.uniswap.org/explore/pools/${deploymentContracts.uniswapChain}/${pool.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {pool.token0.symbol}/{pool.token1.symbol}
              </a>
              {") "}
              {`${pool.fee / 10000}%`}
              <div className="flex float-right text-sm font-normal">
                <Button
                  buttonStyle="primary"
                  className="mr-2"
                  onClick={() => {
                    fetchPositions();
                    refetchHistory();
                  }}
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </Button>
                <Button buttonStyle="primary" onClick={toggleDisplayToken}>
                  Display in{" "}
                  {displayInToken0 ? pool.token1.symbol : pool.token0.symbol}
                </Button>
              </div>
            </h2>
            <p>
              Current Price:{" "}
              {formatValue(
                tickToPrice(
                  pool.tick,
                  pool.token1.decimals,
                  pool.token0.decimals
                )[displayInToken0 ? 1 : 0],
                displayInToken0 ? pool.token0.decimals : pool.token1.decimals
              )}
            </p>
            <p className="text-sm font-normal">
              Grid Balance: {formatValue(gridBalance[0], pool.token0.decimals)}{" "}
              {pool.token0.symbol}
              {" / "}
              {formatValue(gridBalance[1], pool.token1.decimals)}{" "}
              {pool.token1.symbol}
            </p>
          </div>
        ) : (
          <p>No pool information available.</p>
        )}
      </div>
      <div className="w-full h-96 mb-4 grid grid-flow-col justify-items-center">
        <Bar data={chartData} options={chartOptions} />
      </div>
      {owner === address && (
        <Collapse title="Actions">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <form
              onSubmit={handleSubmitDeposit((data) => {
                handleDeposit(
                  data.token0Amount,
                  data.token1Amount,
                  data.slippage,
                  Number(data.gridType),
                  Number(data.distributionType)
                );
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <div>
                <h3 className="font-semibold text-lg mb-2">Deposit</h3>
                <p className="text-sm font-bold text-gray-900/60 mb-4">
                  Add liquidity to the grid positions by specifying token
                  amounts, slippage, and grid type.
                </p>
              </div>
              <div className=" flex flex-col justify-between">
                <input
                  {...registerDeposit("slippage")}
                  type="number"
                  placeholder="Slippage (max 5%)"
                  step={0.01}
                  className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex items-center mb-2">
                  <input
                    {...registerDeposit("token0Amount")}
                    type="number"
                    min={0}
                    step={1 / 10 ** (pool.token0.decimals || 18)}
                    placeholder={`${pool.token0.symbol} Amount`}
                    className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <Button
                    buttonStyle="primary"
                    className="m-2"
                    type="Button"
                    onClick={async () => {
                      const token0Balance = await fetchTokenBalance(
                        pool.token0.address,
                        address
                      );
                      const token1Balance = await fetchTokenBalance(
                        pool.token1.address,
                        address
                      );
                      resetDeposit({
                        token0Amount: formatUnits(
                          token0Balance,
                          pool.token0.decimals
                        ),
                        token1Amount: formatUnits(
                          token1Balance,
                          pool.token1.decimals
                        ),
                        slippage: 0.1,
                      });
                    }}
                  >
                    Max
                  </Button>
                  <Button
                    buttonStyle="primary"
                    type="Button"
                    onClick={() => {
                      const token0Amount = getValuesDeposit("token0Amount");
                      handleTokenApprove(
                        pool.token0.address || "0x00",
                        token0Amount,
                        pool.token0.decimals
                      );
                    }}
                  >
                    Approve
                  </Button>
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
                  <Button
                    buttonStyle="primary"
                    className="m-2"
                    type="Button"
                    onClick={async () => {
                      const token0Balance = await fetchTokenBalance(
                        pool.token0.address,
                        address
                      );
                      const token1Balance = await fetchTokenBalance(
                        pool.token1.address,
                        address
                      );
                      resetDeposit({
                        token0Amount: formatUnits(
                          token0Balance,
                          pool.token0.decimals
                        ),
                        token1Amount: formatUnits(
                          token1Balance,
                          pool.token1.decimals
                        ),
                        slippage: 0.1,
                      });
                    }}
                  >
                    Max
                  </Button>
                  <Button
                    buttonStyle="primary"
                    type="Button"
                    onClick={() => {
                      const token1Amount = getValuesDeposit("token1Amount");
                      handleTokenApprove(
                        pool.token1.address || "0x00",
                        token1Amount,
                        pool.token1.decimals
                      );
                    }}
                  >
                    Approve
                  </Button>
                </div>
                <div className="mb-4">
                  <label className="block font-semibold mb-2">Position</label>
                  <GridType
                    {...registerDeposit("gridType")}
                    token0Symbol={pool.token0.symbol}
                    token1Symbol={pool.token1.symbol}
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-semibold mb-2">
                    Distribution
                  </label>
                  <DistributionType {...registerDeposit("distributionType")} />
                </div>
                <Button buttonStyle="primary" type="submit">
                  Deposit
                </Button>
              </div>
            </form>

            <form
              onSubmit={handleSubmitCompound((data) => {
                handleCompound(
                  data.slippage,
                  Number(data.gridType),
                  Number(data.distributionType)
                );
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <div>
                <h3 className="font-semibold text-lg mb-2">Compound</h3>
                <p className="text-sm font-bold text-gray-900/60 mb-4">
                  Reinvest collected fees into the closest active position.
                </p>
              </div>
              <div className=" flex flex-col justify-between">
                <input
                  {...registerCompound("slippage")}
                  type="number"
                  placeholder="Slippage (max 5%)"
                  step={0.01}
                  className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="mb-4">
                  <label className="block font-semibold mb-2">Position</label>
                  <GridType
                    {...registerCompound("gridType")}
                    token0Symbol={pool.token0.symbol}
                    token1Symbol={pool.token1.symbol}
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-semibold mb-2">
                    Distribution
                  </label>
                  <DistributionType {...registerCompound("distributionType")} />
                </div>
                <Button buttonStyle="primary" type="submit">
                  Compound
                </Button>
              </div>
            </form>

            <form
              onSubmit={handleSubmitSweep((data) => {
                handleSweep(
                  data.slippage,
                  Number(data.gridType),
                  Number(data.distributionType)
                );
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <div>
                <h3 className="font-semibold text-lg mb-2">Sweep</h3>
                <p className="text-sm font-bold text-gray-900/60 mb-4">
                  Remove liquidity from active positions and redeposit tokens
                  within the range based on the current price.
                </p>
              </div>
              <div className=" flex flex-col justify-between">
                <input
                  {...registerSweep("slippage")}
                  type="number"
                  placeholder="Slippage (max 5%)"
                  step={0.01}
                  className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="mb-4">
                  <label className="block font-semibold mb-2">Position</label>
                  <GridType
                    {...registerSweep("gridType")}
                    token0Symbol={pool.token0.symbol}
                    token1Symbol={pool.token1.symbol}
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-semibold mb-2">
                    Distribution
                  </label>
                  <DistributionType {...registerSweep("distributionType")} />
                </div>
                <Button buttonStyle="primary" type="submit">
                  Sweep
                </Button>
              </div>
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleWithdraw();
              }}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Withdraw</h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
                Withdraw all liquidity from the grid positions.
              </p>
              <Button buttonStyle="primary" type="submit">
                Withdraw
              </Button>
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleWithdrawAvailable();
              }}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Withdraw Available</h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
                Withdraw available balances and fees from the grid positions.
              </p>
              <Button buttonStyle="primary" type="submit">
                Withdraw
              </Button>
            </form>

            <form
              onSubmit={handleSubmitGridQuantity((data) => {
                handleSetGridQuantity(BigInt(data.gridQuantity));
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Set Grid Quantity</h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
                Adjust the total number of grid positions for liquidity
                management.
              </p>
              <input
                {...registerGridQuantity("gridQuantity")}
                type="number"
                placeholder="Grid Quantity"
                className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <Button buttonStyle="primary" type="submit">
                Set Grid Quantity
              </Button>
            </form>

            <form
              onSubmit={handleSubmitAddLiquidityToPosition((data) => {
                handleAddLiquidityToPosition(
                  Number(data.token0Amount.toString()),
                  Number(data.token1Amount.toString()),
                  Number(data.slippage),
                  Number(data.tokenId)
                );
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">
                Add Liquidity to Position
              </h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
                Add liquidity to an existing position by specifying token
                amounts and slippage.
              </p>
              <input
                {...registerAddLiquidityToPosition("tokenId")}
                type="number"
                placeholder="Token ID"
                className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <input
                {...registerAddLiquidityToPosition("slippage")}
                type="number"
                placeholder="Slippage (max 5%)"
                step={0.01}
                className="w-full border border-gray-300 rounded-md p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="flex items-center mb-2">
                <input
                  {...registerAddLiquidityToPosition("token0Amount")}
                  type="number"
                  min={0}
                  step={1 / 10 ** (pool.token0.decimals || 18)}
                  placeholder={`${pool.token0.symbol} Amount`}
                  className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Button
                  buttonStyle="primary"
                  className="m-2"
                  type="Button"
                  onClick={async () => {
                    const token0Balance = await fetchTokenBalance(
                      pool.token0.address,
                      address
                    );
                    const token1Balance = await fetchTokenBalance(
                      pool.token1.address,
                      address
                    );
                    resetAddLiquidityToPosition({
                      token0Amount: formatUnits(
                        token0Balance,
                        pool.token0.decimals
                      ),
                      token1Amount: formatUnits(
                        token1Balance,
                        pool.token1.decimals
                      ),
                      slippage: 0.1,
                      tokenId: getValuesAddLiquidityToPosition("tokenId"),
                    });
                  }}
                >
                  Max
                </Button>
                <Button
                  buttonStyle="primary"
                  type="Button"
                  onClick={() => {
                    const token0Amount =
                      getValuesAddLiquidityToPosition("token0Amount");
                    handleTokenApprove(
                      pool.token0.address || "0x00",
                      token0Amount,
                      pool.token0.decimals
                    );
                  }}
                >
                  Approve
                </Button>
              </div>
              <div className="flex items-center mb-2">
                <input
                  {...registerAddLiquidityToPosition("token1Amount")}
                  type="number"
                  min={0}
                  step={1 / 10 ** (pool.token1.decimals || 18)}
                  placeholder={`${pool.token1.symbol} Amount`}
                  className="w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Button
                  buttonStyle="primary"
                  className="m-2"
                  type="Button"
                  onClick={async () => {
                    const token0Balance = await fetchTokenBalance(
                      pool.token0.address,
                      address
                    );
                    const token1Balance = await fetchTokenBalance(
                      pool.token1.address,
                      address
                    );
                    resetAddLiquidityToPosition({
                      token0Amount: formatUnits(
                        token0Balance,
                        pool.token0.decimals
                      ),
                      token1Amount: formatUnits(
                        token1Balance,
                        pool.token1.decimals
                      ),
                      slippage: 0.1,
                      tokenId: getValuesAddLiquidityToPosition("tokenId"),
                    });
                  }}
                >
                  Max
                </Button>
                <Button
                  buttonStyle="primary"
                  type="Button"
                  onClick={() => {
                    const token1Amount =
                      getValuesAddLiquidityToPosition("token1Amount");
                    handleTokenApprove(
                      pool.token1.address || "0x00",
                      token1Amount,
                      pool.token1.decimals
                    );
                  }}
                >
                  Approve
                </Button>
              </div>
              <Button buttonStyle="primary" type="submit">
                Add Liquidity
              </Button>
            </form>

            <form
              onSubmit={handleSubmitMinFees((data) => {
                handleSetMinFees(data.token0MinFees, data.token1MinFees);
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Set Minimum Fees</h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
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
              <Button buttonStyle="primary" type="submit">
                Set Minimum Fees
              </Button>
            </form>

            <form
              onSubmit={handleSubmitGridStep((data) => {
                handleSetGridStep(BigInt(data.gridStep));
              })}
              className="green-card rounded-lg shadow-md p-4 flex flex-col justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Set Grid Step</h3>
              <p className="text-sm font-bold text-gray-900/60 mb-4">
                Modify the step size between grid positions for liquidity
                allocation.
              </p>
              <input
                {...registerGridStep("gridStep")}
                type="number"
                placeholder="Grid Step"
                className="w-full border border-gray-300 rounded-md p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <Button buttonStyle="primary" type="submit">
                Set Grid Step
              </Button>
            </form>
          </div>
        </Collapse>
      )}
      <div className="mb-4 text-sm md:text-base">
        <div className="grid grid-cols-4 md:gap-0 gap-1 font-bold border-b-2 border-gray-300 pb-2 mb-2">
          <div>Position</div>
          <div>Price Range</div>
          <div>Liquidity</div>
          <div>Uncollected Fees</div>
        </div>
        {positions.map((position, index) => {
          const isHighlighted =
            pool &&
            position.tickLower <= pool.tick &&
            position.tickUpper > pool.tick;
          return (
            <div
              key={index}
              className={`grid grid-cols-4 md:gap-0 gap-1 border-b border-gray-200 py-2 ${
                isHighlighted ? "green-card" : ""
              }`}
            >
              <div>
                <a
                  href={`https://app.uniswap.org/positions/v3/${deploymentContracts.uniswapChain}/${position.tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {position.tokenId.toString()}
                </a>
              </div>
              <div className="truncate">
                {formatValue(
                  position.priceLower,
                  displayInToken0 ? pool.token0.decimals : pool.token1.decimals
                )}{" "}
                -{" "}
                {formatValue(
                  position.priceUpper,
                  displayInToken0 ? pool.token0.decimals : pool.token1.decimals
                )}
              </div>
              <div className="truncate">
                {displayInToken0
                  ? formatValue(
                      position.liquidityToken0,
                      displayInToken0
                        ? pool.token0.decimals
                        : pool.token1.decimals
                    )
                  : formatValue(
                      position.liquidityToken1,
                      displayInToken0
                        ? pool.token0.decimals
                        : pool.token1.decimals
                    )}
                <span className="m-2 hidden md:inline">
                  {displayInToken0 ? pool.token0.symbol : pool.token1.symbol}
                </span>
              </div>
              <div>
                <p className="truncate">
                  {formatValue(position.feesToken0, pool.token0.decimals)}{" "}
                  {pool.token0.symbol}
                </p>
                <p className="truncate">
                  {formatValue(position.feesToken1, pool.token1.decimals)}{" "}
                  {pool.token1.symbol}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {history && history.length > 0 && (
        <Collapse title="History" onClick={refetchHistory}>
          <div className="grid grid-cols-5 gap-4 font-bold border-b-2 border-gray-300 pb-2 mb-2">
            <div>Event</div>
            <div className="hidden md:inline-block">Sender</div>
            <div>{pool.token0.symbol}</div>
            <div>{pool.token1.symbol}</div>
            <div>Date</div>
          </div>
          {isHistoryLoading ? (
            <p className="flex justify-center items-center h-32">Loading...</p>
          ) : (
            history?.map((entry, index) => (
              <div
                key={index}
                className="grid grid-cols-5 gap-4 border-b border-gray-200 py-2"
              >
                <div className="truncate">{entry.event}</div>
                <div className="hidden md:inline-block truncate">
                  {entry.owner}
                </div>
                <div className="truncate">
                  {formatValue(
                    Number(
                      formatUnits(entry.token0Amount, pool.token0.decimals)
                    ),
                    pool.token0.decimals
                  )}
                </div>
                <div className="truncate">
                  {formatValue(
                    Number(
                      formatUnits(entry.token1Amount, pool.token1.decimals)
                    ),
                    pool.token1.decimals
                  )}
                </div>
                <div>{entry.timestamp}</div>
              </div>
            ))
          )}
        </Collapse>
      )}
      <ToastContainer />
    </div>
  );
};

export default ManagePositions;
