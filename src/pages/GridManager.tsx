import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  GridManagerABI,
  GridPositionManagerABI,
  IERC20MetadataABI,
  IUniswapV3FactoryABI,
  IUniswapV3PoolABI,
} from "../abis";
import { useAppKitAccount } from "@reown/appkit/react";
import { useQuery } from "@tanstack/react-query";
import { getLogs } from "viem/actions";
import { config, deploymentConfigMap } from "../config";
import {
  getBlock,
  getPublicClient,
  multicall,
  readContract,
  writeContract,
} from "@wagmi/core";
import { formatUnits, parseAbiItem } from "viem";
import { ToastContainer, toast } from "react-toastify";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Token } from "@uniswap/sdk-core";
import { useChainId } from "wagmi";
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ArrowUpRightIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline";
import { gql, useQuery as useQLQuery } from "urql";
import { DeploymentConfig, GridDeployment, PoolInfo } from "../types";
import { priceToTick, tickToPrice } from "../utils/uniswapUtils";
import Collapse from "../components/Collapse";
import TokenSearchDropdown from "../components/TokenSearchDropdown";
import Button from "../components/Button";

const QUERY = gql`
  query Grids($owner: String!) {
    gridDeployeds(where: { owner: $owner }) {
      gridPositionManager
      pool
      blockNumber
      blockTimestamp
    }
  }
`;

const UNISWAP_FEE_TIERS = [100, 500, 3000, 10000]; // Example fee tiers (0.01%, 0.05%, 0.3%)

const GridManager = () => {
  const { address, isConnected } = useAppKitAccount();
  const client = getPublicClient(config);
  const [openGrids, setOpenGrids] = useState<GridDeployment[]>([]);
  const [exitedGrids, setExitedGrids] = useState<GridDeployment[]>([]);
  const [deploymentContracts, setDeploymentContracts] =
    useState<DeploymentConfig>({} as DeploymentConfig);
  const [selectedToken0, setSelectedToken0] = useState<string>();
  const [selectedToken1, setSelectedToken1] = useState<string>();
  const [token0, setToken0] = useState<Token>();
  const [token1, setToken1] = useState<Token>();
  const [feeTier, setFeeTier] = useState(3000); // Example: 0.3% fee tier
  const [poolAddress, setPoolAddress] = useState<string>();
  const [currentPrice, setCurrentPrice] = useState<string>();
  const [isOwner, setIsOwner] = useState(false);
  const [newImplementation, setNewImplementation] = useState("");

  const [displayInToken0, setDisplayInToken0] = useState(false);

  const chainId = useChainId({ config });

  const toggleDisplayToken = () => {
    setDisplayInToken0((prev) => !prev);
  };

  const { register, handleSubmit, reset, setValue } = useForm({
    defaultValues: {
      pool: "",
      gridSize: 2,
      gridStep: 0,
      priceLower: "",
      priceUpper: "",
    },
  });

  const [queryResult, reexecuteQuery] = useQLQuery({
    query: QUERY,
    pause: !address,
    variables: { owner: address },
    context: useMemo(() => {
      return {
        url: `https://gateway.thegraph.com/api/subgraphs/id/${deploymentContracts.gridManagerSubgraphId}`,
      };
    }, [deploymentContracts.gridManagerSubgraphId]),
  });

  const logsQuery = useCallback(async () => {
    if (!isConnected || !deploymentContracts.gridManager) return [];
    const block = await getBlock(config, {
      chainId: chainId,
    });
    const qlLogs = queryResult.data?.gridDeployeds?.map(
      ({ blockNumber, blockTimestamp, ...args }) => ({
        args,
        blockNumber,
        blockTimestamp,
      })
    ) || [];
    // since the subgraph is not always up to date, we need to fetch the logs from the blockchain
    const blLogs = await getLogs(client, {
      address: deploymentContracts.gridManager,
      event: parseAbiItem(
        "event GridDeployed(address indexed owner, address indexed gridPositionManager, address pool)"
      ),
      args: {
        owner: address,
      },
    });
    const uniqueLogs = [
      ...new Map(
      [...blLogs, ...qlLogs].map((log) => [log.args.gridPositionManager, log])
      ).values(),
    ];
    return uniqueLogs
      .map(({ args, blockNumber, blockTimestamp }) => ({
      ...args,
      blockNumber,
      blockTimestamp: blockTimestamp || block.timestamp,
      }))
      .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
  }, [address, chainId, client, deploymentContracts.gridManager, isConnected, queryResult.data?.gridDeployeds]);

  const {
    data: gridDeploymentLogs,
    isLoading: isLogsLoading,
    refetch,
  } = useQuery({
    queryKey: ["logs", isConnected, address, queryResult.data?.gridDeployeds],
    queryFn: logsQuery,
  });

  const fetchPoolInfo = useCallback(async () => {
    if (!gridDeploymentLogs?.length) return;

    try {
      const deploymentPromises = gridDeploymentLogs.map(async (deployment) => {
        const [a, b, c] = await multicall(config, {
          contracts: [
            {
              address: deployment.gridPositionManager,
              abi: GridPositionManagerABI,
              functionName: "getPoolInfo",
            },
            {
              address: deployment.gridPositionManager,
              abi: GridPositionManagerABI,
              functionName: "getLiquidity",
            },
            {
              address: deployment.gridPositionManager,
              abi: GridPositionManagerABI,
              functionName: "isInRange",
            },
          ],
        });
        return {
          grid: deployment.gridPositionManager,
          ...(a.status === "success" ? { ...(a.result as PoolInfo) } : {}),
          ...(b.status === "success"
            ? {
                token0Liquidity: (b.result as number[])[0],
                token1Liquidity: (b.result as number[])[1],
              }
            : { token0Liquidity: 0, token1Liquidity: 0 }),
          ...(c.status === "success"
            ? { isInRange: c.result as boolean }
            : { isInRange: false }),
          isNew: deployment.blockTimestamp > Date.now() / 1000 - 86400,
        } as unknown as GridDeployment;
      });
      const deployments = await Promise.all(deploymentPromises);
      const openGrids = deployments.filter(
        (deployment) =>
          deployment.token0Liquidity > 0 || deployment.token1Liquidity > 0
      );
      const exitedGrids = deployments.filter(
        (deployment) =>
          !deployment.token0Liquidity && !deployment.token1Liquidity
      );
      setOpenGrids(openGrids);
      setExitedGrids(exitedGrids);
    } catch (error) {
      console.error(`Error fetching grids with multicall:`, error);
    }
  }, [gridDeploymentLogs]);

  const calculatePricePercentage = useCallback(
    (percentage: number) => {
      {
        if (currentPrice) {
          const price = parseFloat(currentPrice);
          if (!isNaN(price)) {
            const calculatedValue = (price * percentage) / 100;
            const decimals = displayInToken0
              ? token0?.decimals
              : token1?.decimals;
            setValue("priceLower", (price - calculatedValue).toFixed(decimals));
            setValue("priceUpper", (price + calculatedValue).toFixed(decimals));
          }
        }
      }
    },
    [
      currentPrice,
      displayInToken0,
      setValue,
      token0?.decimals,
      token1?.decimals,
    ]
  );

  useEffect(() => {
    fetchPoolInfo();
  }, [fetchPoolInfo]);

  const deployGrid = async (
    gridSize: number,
    priceLower: string,
    priceUpper: string
  ) => {
    try {
      if (!poolAddress || !token0 || !token1) {
        toast.error("Please select a valid token pair.");
        return;
      }
      if (!priceLower || !priceUpper) {
        toast.error("Please provide a valid price range.");
        return;
      }
      if (gridSize <= 0) {
        toast.error("Grid size must be greater than 0.");
        return;
      }
      if (Number(priceLower) >= Number(priceUpper)) {
        toast.error("Price lower must be less than price upper.");
        return;
      }
      const tickSpacing = (await readContract(config, {
        address: poolAddress,
        abi: IUniswapV3PoolABI,
        functionName: "tickSpacing",
      })) as number;
      const lowerTick =
        priceToTick(
          displayInToken0 ? token0 : token1,
          displayInToken0 ? token1 : token0,
          Number(priceLower),
          tickSpacing
        ) * (displayInToken0 ? -1 : 1);
      const upperTick =
        priceToTick(
          displayInToken0 ? token0 : token1,
          displayInToken0 ? token1 : token0,
          Number(priceUpper),
          tickSpacing
        ) * (displayInToken0 ? -1 : 1);
      const tickRange = Math.floor(
        Math.abs(upperTick - lowerTick) / tickSpacing
      );
      const gridStep = Math.floor(tickRange / gridSize);
      if (gridStep < 1) {
        toast.error("Price range is too small for the grid size.");
        return;
      }
      const hash = await writeContract(config, {
        address: deploymentContracts.gridManager,
        abi: GridManagerABI,
        functionName: "delployGridPositionManager",
        args: [
          poolAddress,
          deploymentContracts.uniswapV3PositionManager,
          gridSize,
          gridStep,
        ],
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
      toast.success("Grid deployed successfully.");
      reset();
      refetch();
    } catch (error) {
      toast.error(`Error deploying grid: ${(error as Error).message}`);
      console.error(`Error deploying grid:`, error);
    }
  };

  const onSubmit = (data: {
    gridSize: number;
    priceLower: string;
    priceUpper: string;
  }) => {
    deployGrid(data.gridSize, data.priceLower, data.priceUpper);
  };

  const checkOwnership = useCallback(async () => {
    if (!isConnected || !address || !deploymentContracts.gridManager) return;

    try {
      const owner = await readContract(config, {
        address: deploymentContracts.gridManager,
        abi: GridManagerABI,
        functionName: "owner",
      });
      setIsOwner(owner.toLowerCase() === address.toLowerCase());
    } catch (error) {
      console.error("Error checking ownership:", error);
    }
  }, [isConnected, address, deploymentContracts.gridManager]);

  useEffect(() => {
    checkOwnership();
  }, [checkOwnership]);

  useEffect(() => {
    const fetchTokenMetadata = async () => {
      if (selectedToken0 && selectedToken1 && poolAddress) {
        const [poolToken0Call, token0DecimalsCall, token1DecimalsCall] =
          await multicall(config, {
            contracts: [
              {
                address: poolAddress,
                abi: IUniswapV3PoolABI,
                functionName: "token0",
              },
              {
                address: selectedToken0,
                abi: IERC20MetadataABI,
                functionName: "decimals",
              },
              {
                address: selectedToken1,
                abi: IERC20MetadataABI,
                functionName: "decimals",
              },
            ],
          });
        if (
          token0DecimalsCall.status === "success" &&
          token1DecimalsCall.status === "success" &&
          poolToken0Call.status === "success"
        ) {
          const token0Decimals = token0DecimalsCall.result as number;
          const token1Decimals = token1DecimalsCall.result as number;
          const poolToken0 = poolToken0Call.result as string;
          if (poolToken0.toLowerCase() === selectedToken1.toLowerCase()) {
            setToken0(new Token(chainId, selectedToken0, token0Decimals));
            setToken1(new Token(chainId, selectedToken1, token1Decimals));
          } else {
            setToken0(new Token(chainId, selectedToken1, token1Decimals));
            setToken1(new Token(chainId, selectedToken0, token0Decimals));
          }
          setDisplayInToken0(false);
        }
      }
    };
    fetchTokenMetadata();
  }, [chainId, poolAddress, selectedToken0, selectedToken1]);

  useEffect(() => {
    const getCurrentPrice = async () => {
      if (poolAddress && token0 && token1) {
        const slot0 = await readContract(config, {
          address: poolAddress,
          abi: IUniswapV3PoolABI,
          functionName: "slot0",
        });

        const currentTick = slot0[1] as number;
        const [token0Price, token1Price] = tickToPrice(
          currentTick,
          token0.decimals,
          token1.decimals
        );
        const startPrice = displayInToken0
          ? token0Price.toFixed(token0.decimals)
          : token1Price.toFixed(token1.decimals);
        setValue("priceLower", startPrice);
        setValue("priceUpper", startPrice);
        setCurrentPrice(startPrice);
      } else {
        setValue("priceLower", "");
        setValue("priceUpper", "");
      }
    };
    getCurrentPrice();
  }, [chainId, displayInToken0, poolAddress, setValue, token0, token1]);

  useEffect(() => {
    if (selectedToken0 && selectedToken1 && feeTier) {
      const fetchPoolAddress = async () => {
        if (selectedToken0 === selectedToken1) {
          setPoolAddress(undefined);
          setToken0(undefined);
          setToken1(undefined);
          return;
        }
        if (selectedToken0 === "" || selectedToken1 === "") {
          setPoolAddress(undefined);
          setToken0(undefined);
          setToken1(undefined);
          return;
        }
        try {
          const pool = (await readContract(config, {
            address: deploymentContracts.uniswapV3Factory,
            abi: IUniswapV3FactoryABI,
            functionName: "getPool",
            args: [selectedToken0, selectedToken1, feeTier],
          })) as string;
          if (pool === "0x0000000000000000000000000000000000000000" || !pool) {
            toast.error("No pool found for the selected tokens.");
          } else if (pool !== poolAddress) {
            setPoolAddress(pool);
            setToken0(undefined);
            setToken1(undefined);
          }
        } catch (error) {
          toast.error(
            `Error fetching pool address: ${(error as Error).message}`
          );
          console.error("Error fetching pool address:", error);
        }
      };
      fetchPoolAddress();
    } else {
      setPoolAddress(undefined);
      setToken0(undefined);
      setToken1(undefined);
    }
  }, [
    chainId,
    deploymentContracts.uniswapV3Factory,
    feeTier,
    poolAddress,
    selectedToken0,
    selectedToken1,
    setValue,
  ]);

  useEffect(() => {
    if (chainId) {
      setDeploymentContracts(deploymentConfigMap[chainId]);
    }
  }, [chainId]);

  useEffect(() => {
    if (deploymentContracts.gridManager) {
      refetch();
      reexecuteQuery({ requestPolicy: "network-only", url: `https://gateway.thegraph.com/api/subgraphs/id/${deploymentContracts.gridManagerSubgraphId}`, });
      setOpenGrids([]);
      setExitedGrids([]);
    }
  }, [deploymentContracts.gridManager, deploymentContracts.gridManagerSubgraphId, reexecuteQuery, refetch]);

  const upgradeTo = async () => {
    if (!newImplementation) {
      toast.error("Please provide a new implementation address.");
      return;
    }

    try {
      const hash = await writeContract(config, {
        address: deploymentContracts.gridManager,
        abi: GridManagerABI,
        functionName: "upgradeTo",
        args: [newImplementation],
        account: address,
      });
      toast(`Transaction Hash: ${hash}`);
      await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      toast.success("Upgrade successful.");
      setNewImplementation("");
    } catch (error) {
      toast.error(`Error upgrading contract: ${(error as Error).message}`);
      console.error("Error upgrading contract:", error);
    }
  };

  return (
    <div className="m-2 md:m-10">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 md:gap-10 gap-0">
        <Collapse title="Deploy Grid" open={true} collapsible={false}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block font-medium">Token 0</label>
              <TokenSearchDropdown
                value={selectedToken0}
                onChange={setSelectedToken0}
              />
            </div>
            <div>
              <label className="block font-medium">Token 1</label>
              <TokenSearchDropdown
                value={selectedToken1}
                onChange={setSelectedToken1}
              />
            </div>
            <div>
              <label className="block font-medium">Fee Tier</label>
              <select
                value={feeTier}
                onChange={(e) => setFeeTier(e.target.value)}
                className="border p-2 rounded w-full"
              >
                {UNISWAP_FEE_TIERS.map((token) => (
                  <option
                    key={token}
                    value={token}
                    className="bg-gray-400 text-gray-800"
                  >
                    {token / 10000}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium">Grid Size</label>
              <input
                {...register("gridSize", {
                  required: true,
                  valueAsNumber: true,
                })}
                type="number"
                placeholder="Grid Size"
                className="border p-2 rounded w-full"
              />
            </div>
            <div>
              {selectedToken0 && selectedToken1 && (
                <div className="flex flex-col justify-between">
                  {poolAddress && (
                    <a
                      href={`https://app.uniswap.org/explore/pools/${deploymentContracts.uniswapChain}/${poolAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline mr-2 mb-2"
                    >
                      View Pool
                      <ArrowUpRightIcon className="h-4 w-4 inline-block ml-1" />
                    </a>
                  )}
                  <div>
                    <Button type="Button" className="mb-2" onClick={toggleDisplayToken}>
                      Toggle Price
                      <ArrowsRightLeftIcon className="h-4 w-4 inline-block ml-1" />
                    </Button>
                  </div>
                  <span className="font-mono">
                    Current Price: {currentPrice}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label className="block font-medium">Price Lower</label>
              <input
                {...register("priceLower", { required: true })}
                type="text"
                placeholder="Price Lower"
                className="border p-2 rounded w-full"
              />
            </div>
            <div>
              <label className="block font-medium">Price Upper</label>
              <input
                {...register("priceUpper", { required: true })}
                type="text"
                placeholder="Price Upper"
                className="border p-2 rounded w-full"
              />
            </div>
            <div>
              <div className="flex space-x-2">
                {[1, 3, 5, 10].map((percentage) => (
                  <Button
                    type="Button"
                    key={percentage}
                    buttonStyle="primary"
                    onClick={() => calculatePricePercentage(percentage)}
                  >
                    {percentage}%
                  </Button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={!poolAddress}>
              Deploy Grid
            </Button>
          </form>
          {isOwner && (
            <div className="mt-10">
              <h2 className="text-xl font-bold mb-4">Upgrade Contract</h2>
              <div className="space-y-4">
                <div>
                  <label className="block font-medium">
                    New Implementation Address
                  </label>
                  <input
                    type="text"
                    value={newImplementation}
                    onChange={(e) => setNewImplementation(e.target.value)}
                    placeholder="0xNewImplementationAddress"
                    className="border p-2 rounded w-full"
                  />
                </div>
                <Button onClick={upgradeTo} className="bg-red-500">
                  Upgrade Contract
                </Button>
              </div>
            </div>
          )}
        </Collapse>
        <div className="md:col-span-2">
          <Collapse title="Open Grids" open={true}>
            {isLogsLoading ? (
              <p>Loading grids...</p>
            ) : (
              <div className="sm:max-h-full md:max-h-6/10 overflow-y-auto">
                {openGrids?.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {openGrids.map((deployment) => (
                      <Link
                        to={`/manage/${deployment.grid}`}
                        key={`${deployment.grid}`}
                      >
                        <div
                          className={`border p-4 rounded shadow hover:shadow-lg transition hover:green-card hover:text-white ${
                            deployment.isInRange ? "" : "border-red-900"
                          }`}
                        >
                          <p>
                            <strong>Pool:</strong> ({deployment.token0Symbol}/
                            {deployment.token1Symbol}){" "}
                            {(deployment.fee / 10000).toFixed(2)}%
                          </p>
                          <p>
                            <strong>Liquidity:</strong>
                          </p>
                          <p>
                            {formatUnits(
                              deployment.token0Liquidity,
                              deployment.token0Decimals
                            )}{" "}
                            {deployment.token0Symbol} /{" "}
                            {formatUnits(
                              deployment.token1Liquidity,
                              deployment.token1Decimals
                            )}{" "}
                            {deployment.token1Symbol}
                          </p>
                          <p>
                            <strong>Steps:</strong> {deployment.gridStep}
                          </p>
                          <p>
                            <strong>Grids:</strong> {deployment.gridQuantity}
                          </p>
                          <p>
                            <strong>In Range:</strong>{" "}
                            {deployment.isInRange ? "Yes" : "No"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p>No grids found.</p>
                )}
              </div>
            )}
            <div className="mt-4">
              <Button onClick={() => refetch()}>
                <ArrowPathIcon className="h-5 w-5" />
              </Button>
            </div>
          </Collapse>
          <Collapse title="Exited Grids" open={true}>
            <div className="sm:max-h-full md:max-h-6/10 overflow-y-auto">
              {exitedGrids?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                  {exitedGrids.map((deployment) => (
                    <Link
                      to={`/manage/${deployment.grid}`}
                      key={`${deployment.grid}`}
                    >
                      <div className="border p-4 rounded shadow hover:shadow-lg transition hover:green-card hover:text-white text-gray-500">
                        <p
                          className={`${
                            deployment.isNew
                              ? "block flex float-right text-yellow-500"
                              : "hidden"
                          }`}
                        >
                          <MegaphoneIcon className="h-5 w-5 mr-2" />
                          New!
                        </p>
                        <p>
                          <strong>Pool:</strong> ({deployment.token0Symbol}/
                          {deployment.token1Symbol}){" "}
                          {(deployment.fee / 10000).toFixed(2)}%
                        </p>
                        <p>
                          <strong>Liquidity:</strong>
                        </p>
                        <p>
                          {formatUnits(
                            deployment.token0Liquidity,
                            deployment.token0Decimals
                          )}{" "}
                          {deployment.token0Symbol} /{" "}
                          {formatUnits(
                            deployment.token1Liquidity,
                            deployment.token1Decimals
                          )}{" "}
                          {deployment.token1Symbol}
                        </p>
                        <p>
                          <strong>Steps:</strong> {deployment.gridStep}
                        </p>
                        <p>
                          <strong>Grids:</strong> {deployment.gridQuantity}
                        </p>
                        <p>
                          <strong>InRange:</strong>{" "}
                          {deployment.isInRange ? "Yes" : "No"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p>No grids found.</p>
              )}
            </div>
            <div className="mt-4">
              <Button onClick={() => refetch()}>
                <ArrowPathIcon className="h-5 w-5" />
              </Button>
            </div>
          </Collapse>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

export default GridManager;
