import React, { useEffect, useState, useCallback } from "react";
import {
  GridManagerABI,
  GridPositionManagerABI,
  IUniswapV3FactoryABI,
} from "./abis";
import { useAppKitAccount } from "@reown/appkit/react";
import { useQuery } from "@tanstack/react-query";
import { getLogs } from "viem/actions";
import { config, deploymentContractsMap, trustedTokensMap,  } from "./config";
import {
  getPublicClient,
  multicall,
  readContract,
  writeContract,
} from "@wagmi/core";
import { parseAbiItem } from "viem";
import { toast } from "react-toastify";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { DeploymentContract, GridDeployment, PoolInfo, TrustedToken } from "./types";
import { fromRawTokenAmount } from "./utils/uniswapUtils";
import { useChainId } from "wagmi";

const UNISWAP_FEE_TIERS = [100, 500, 3000, 10000]; // Example fee tiers (0.01%, 0.05%, 0.3%)

const GridManager = () => {
  const { address, isConnected } = useAppKitAccount();
  const client = getPublicClient(config);
  const [deployments, setDeployments] = useState<GridDeployment[]>([]);
  const [trustedTokens, setTrustedTokens] = useState<
    TrustedToken[]
  >([]);
  const [deploymentContracts, setDeploymentContracts] =
    useState<DeploymentContract>({} as DeploymentContract);
  const [selectedToken0, setSelectedToken0] = useState();
  const [selectedToken1, setSelectedToken1] = useState();
  const [feeTier, setFeeTier] = useState(3000); // Example: 0.3% fee tier
  const [poolAddress, setPoolAddress] = useState();

  const [isOwner, setIsOwner] = useState(false);
  const [newImplementation, setNewImplementation] = useState("");

  const { data: gridDeploymentLogs, refetch } = useQuery({
    queryKey: ["logs", isConnected, address],
    queryFn: async () => {
      if (!isConnected || !deploymentContracts.gridManager) return [];
      const logs = await getLogs(client, {
        address: deploymentContracts.gridManager,
        event: parseAbiItem(
          "event GridDeployed(address indexed owner, address indexed gridPositionManager, address pool)"
        ),
        args: {
          owner: address,
        },
        fromBlock: 0n,
      });
      return logs.map(({ args }) => ({ ...args }));
    },
  });

  const chainId = useChainId({config});

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
        } as unknown as GridDeployment;
      });
      const deployments = await Promise.all(deploymentPromises);
      setDeployments(deployments);
    } catch (error) {
      console.error(`Error fetching pool info with multicall:`, error);
    }
  }, [gridDeploymentLogs]);

  useEffect(() => {
    fetchPoolInfo();
  }, [fetchPoolInfo]);

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      pool: "",
      gridSize: 0,
      gridStep: 0,
    },
  });

  const deployGrid = async (gridSize: number, gridStep: number) => {
    try {
      if (!poolAddress) {
        toast.error("Please select a valid token pair.");
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
      reset();
      refetch();
      toast(`Transaction Hash: ${hash}`);
    } catch (error) {
      toast.error(`Error deploying grid: ${(error as Error).message}`);
      console.error(`Error deploying grid:`, error);
    }
  };

  const onSubmit = (data: { gridSize: number; gridStep: number }) => {
    deployGrid(data.gridSize, data.gridStep);
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
    if (selectedToken0 && selectedToken1 && feeTier) {
      const fetchPoolAddress = async () => {
        if (selectedToken0 === selectedToken1) {
          setPoolAddress(undefined);
          return;
        }
        if(selectedToken0 === "" || selectedToken1 === "") {
          setPoolAddress(undefined);
          return;
        }
        try {
          const pool = await readContract(config, {
            address: deploymentContracts.uniswapV3Factory,
            abi: IUniswapV3FactoryABI,
            functionName: "getPool",
            args: [selectedToken0, selectedToken1, feeTier],
          });

          if (pool === "0x0000000000000000000000000000000000000000" || !pool) {
            toast.error("No pool found for the selected tokens.");
          } else {
            setPoolAddress(pool);
            toast.success(`Pool Address: ${pool}`);
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
    }
  }, [deploymentContracts.uniswapV3Factory, feeTier, selectedToken0, selectedToken1]);

  useEffect(() => {
    if(chainId){ 
      setTrustedTokens(trustedTokensMap[chainId]);
      setDeploymentContracts(deploymentContractsMap[chainId]);
    }
  }
  , [chainId]);

  useEffect(() => {
    if(deploymentContracts.gridManager){
      refetch();
    }
  }
  , [deploymentContracts.gridManager, refetch]);

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

      toast.success(`Upgrade successful. Transaction Hash: ${hash}`);
    } catch (error) {
      toast.error(`Error upgrading contract: ${(error as Error).message}`);
      console.error("Error upgrading contract:", error);
    }
  };

  return (
    <div className="m-10">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <h2 className="text-xl font-bold mb-4">Deploy Grid</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block font-medium">Token 0</label>
              <select
                value={selectedToken0}
                onChange={(e) => setSelectedToken0(e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="" className="bg-gray-400 text-gray-800">Select Token 0</option>
                {trustedTokens.map((token) => (
                  <option key={token.address} value={token.address} className="bg-gray-400 text-gray-800">
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium">Token 1</label>
              <select
                value={selectedToken1}
                onChange={(e) => setSelectedToken1(e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="" className="bg-gray-400 text-gray-800">Select Token 1</option>
                {trustedTokens.map((token) => (
                  <option key={token.address} value={token.address} className="bg-gray-400 text-gray-800">
                    {token.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium">Fee Tier</label>
              <select
                value={feeTier}
                onChange={(e) => setFeeTier(e.target.value)}
                className="border p-2 rounded w-full"
              >
                {UNISWAP_FEE_TIERS.map((token) => (
                  <option key={token} value={token} className="bg-gray-400 text-gray-800">
                    {token /10000}%
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
              <label className="block font-medium">Grid Step</label>
              <input
                {...register("gridStep", {
                  required: true,
                  valueAsNumber: true,
                })}
                type="number"
                placeholder="Grid Step"
                className="border p-2 rounded w-full"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={!poolAddress}
            >
              Deploy Grid
            </button>
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
                <button
                  onClick={upgradeTo}
                  className="bg-red-500 text-white px-4 py-2 rounded"
                >
                  Upgrade Contract
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold mb-4">Deployments</h2>
          <div className="sm:max-h-full md:max-h-6/10 overflow-y-auto">
            {deployments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deployments.map((deployment) => (
                  <Link
                    to={`/manage/${deployment.grid}`}
                    key={`${deployment.grid}`}
                  >
                    <div className="border p-4 rounded shadow hover:shadow-lg transition hover:green-card hover:text-white">
                      <p>
                        <strong>Pool:</strong> ({deployment.token0Symbol}/
                        {deployment.token1Symbol}){" "}
                        {(deployment.fee / 10000).toFixed(2)}%
                      </p>
                      <p>
                        <strong>Liquidity:</strong>
                      </p>
                      <p>
                        {fromRawTokenAmount(
                          deployment.token0Liquidity,
                          deployment.token0Decimals
                        ).toFixed(6)}{" "}
                        {deployment.token0Symbol} /{" "}
                        {fromRawTokenAmount(
                          deployment.token1Liquidity,
                          deployment.token1Decimals
                        ).toFixed(6)}{" "}
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
              <p>No deployments found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridManager;
