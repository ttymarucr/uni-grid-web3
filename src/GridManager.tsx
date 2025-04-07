import React, { useEffect, useState, useCallback } from "react";
import { GridManagerABI, GridPositionManagerABI } from "./abis";
import { useAppKitAccount } from "@reown/appkit/react";
import { useQuery } from "@tanstack/react-query";
import { getLogs, writeContract } from "viem/actions";
import { config } from "./config";
import { getPublicClient, multicall } from "@wagmi/core";
import { parseAbiItem } from "viem";
import { toast } from "react-toastify";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

const GRID_MANAGER_ADDRESS = "0x134FBc6CC346cF2c8b29487A5880328112023704"; // Replace with your contract address

const GridManager = () => {
  const { address, isConnected } = useAppKitAccount();
  const client = getPublicClient(config);

  const { data: gridDeploymentLogs } = useQuery({
    queryKey: ["logs", isConnected, address],
    queryFn: async () => {
      if (!isConnected) return [];
      const logs = await getLogs(client, {
        address: GRID_MANAGER_ADDRESS,
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

  const [deployments, setDeployments] = useState([]);

  const fetchPoolInfo = useCallback(async () => {
    if (!gridDeploymentLogs?.length) return;

    try {
      const results = await multicall(config, {
        contracts: gridDeploymentLogs.map((deployment) => ({
          address: deployment.gridPositionManager,
          abi: GridPositionManagerABI,
          functionName: "getPoolInfo",
        })),
      });

      const updatedDeployments = gridDeploymentLogs.map((deployment, index) => {
        const poolInfo = results[index].result;
        return {
          ...deployment,
          gridStep: poolInfo?.gridStep || 0,
          gridQuantity: poolInfo?.gridQuantity || 0,
          token0Symbol: poolInfo?.token0Symbol || "N/A",
          token1Symbol: poolInfo?.token1Symbol || "N/A",
        };
      });

      setDeployments(updatedDeployments);
    } catch (error) {
      console.error(`Error fetching pool info with multicall:`, error);
    }
  }, [gridDeploymentLogs]);

  useEffect(() => {
    fetchPoolInfo();
  }, [fetchPoolInfo]);

  const deployGrid = async (
    pool: `0x${string}`,
    positionManager: `0x${string}`,
    gridSize: number,
    gridStep: number
  ) => {
    try {
      const hash = await writeContract(config, {
        address: GRID_MANAGER_ADDRESS,
        abi: GridManagerABI,
        functionName: "delployGridPositionManager",
        args: [pool, positionManager, gridSize, gridStep],
      });
      toast(`Transaction Hash: ${hash}`);
    } catch (error) {
      toast.error(`Error deploying grid: ${(error as Error).message}`);
      console.error(`Error deploying grid:`, error);
    }
  };

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      pool: "",
      positionManager: "",
      gridSize: 0,
      gridStep: 0,
    },
  });

  const onSubmit = (data: {
    pool: `0x${string}`;
    positionManager: `0x${string}`;
    gridSize: number;
    gridStep: number;
  }) => {
    deployGrid(data.pool, data.positionManager, data.gridSize, data.gridStep);
    reset();
  };

  return (
    <div className="m-10">
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-10">
        <div>
          <h2 className="text-xl font-bold mb-4">Deploy Grid</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block font-medium">Pool Address</label>
              <input
                {...register("pool", { required: true })}
                type="text"
                placeholder="0xPoolAddress"
                className="border p-2 rounded w-full"
              />
            </div>
            <div>
              <label className="block font-medium">
                Position Manager Address
              </label>
              <input
                {...register("positionManager", { required: true })}
                type="text"
                placeholder="0xPositionManagerAddress"
                className="border p-2 rounded w-full"
              />
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
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Deploy Grid
            </button>
          </form>
        </div>
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold mb-4">Deployments</h2>
          <div className="sm:max-h-full md:max-h-6/10 overflow-y-auto">
            {deployments?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deployments.map((deployment, index) => (
                  <Link
                    to={`/manage/${deployment.gridPositionManager}`}
                    key={`${deployment.gridPositionManager}`}
                  >
                    <div
                      className="border p-4 rounded shadow hover:shadow-lg transition hover:green-card hover:text-white"
                    >
                      <p>
                        <strong>Pool:</strong> ({deployment.token0Symbol}/
                        {deployment.token1Symbol})
                      </p>
                      <p>
                        <strong>Liquidity:</strong> {0}
                      </p>
                      <p>
                        <strong>Steps:</strong> {deployment.gridStep}
                      </p>
                      <p>
                        <strong>Grids:</strong> {deployment.gridQuantity}
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
