import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getAccount, connect, disconnect, readContract, writeContract } from '@wagmi/core';
import { ToastContainer, toast } from 'react-toastify';
import { GridPositionManagerABI } from './abis';
import { config } from './config';
import { Position } from './types';

// eslint-disable-next-line @typescript-eslint/no-redeclare
interface BigInt {
  /** Convert to BigInt to string form in JSON.stringify */
  toJSON: () => string;
}
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const ManagePositions: React.FC = () => {
  const { contractAddress } = useParams<{ contractAddress: string }>();
  const { address, isConnected } = getAccount(config);
  const [positions, setPositions] = useState<Position[]>([]);

  console.log(address, isConnected, contractAddress);

  const fetchPositions = useCallback(async () => {
    if (isConnected && address && contractAddress) {
      try {
        const activeIndexes: readonly bigint[] = await readContract(config, {
          address: contractAddress as `0x${string}`,
          abi: GridPositionManagerABI,
          functionName: 'getActivePositionIndexes',
        });

        const userPositions = await Promise.all(
          activeIndexes.map((index) =>
            readContract(config, {
              address: contractAddress as `0x${string}`,
              abi: GridPositionManagerABI,
              functionName: 'getPosition',
              args: [BigInt(index)],
            })
          )
        );

        setPositions(userPositions);
      } catch (error) {
        console.error('Error fetching positions:', error);
      }
    }
  }, [address, isConnected, contractAddress]);

  const handleContractAction = async (
    functionName: "deposit" | "close" | "compound" | "emergencyWithdraw" | "recoverEther" | "renounceOwnership" | "setGridQuantity" | "setGridStep" | "setMinFees" | "sweep" | "transferOwnership" | "withdraw",
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

  const handleDeposit = async (token0Amount: bigint, token1Amount: bigint, slippage: bigint) => {
    await handleContractAction('deposit', [token0Amount, token1Amount, slippage]);
  };

  const handleWithdraw = async () => {
    await handleContractAction('withdraw');
  };

  const handleCompound = async (slippage: bigint) => {
    await handleContractAction('compound', [slippage]);
  };

  const handleSweep = async (slippage: bigint) => {
    await handleContractAction('sweep', [slippage]);
  };

  const handleClose = async () => {
    await handleContractAction('close');
  };

  const handleEmergencyWithdraw = async () => {
    await handleContractAction('emergencyWithdraw');
  };

  const handleSetMinFees = async (token0MinFees: bigint, token1MinFees: bigint) => {
    await handleContractAction('setMinFees', [token0MinFees, token1MinFees]);
  };

  const handleSetGridQuantity = async (gridQuantity: bigint) => {
    await handleContractAction('setGridQuantity', [gridQuantity]);
  };

  const handleSetGridStep = async (gridStep: bigint) => {
    await handleContractAction('setGridStep', [gridStep]);
  };

  useEffect(() => {
    fetchPositions();
  }, [isConnected, address, fetchPositions]);

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
        <button onClick={() => connect(config, { connector: config.connectors[0] })}>Connect Wallet</button>
      )}
      <button onClick={fetchPositions}>Fetch Positions</button>
      <button onClick={() => handleDeposit(BigInt(1000), BigInt(1000), BigInt(100))}>Deposit</button>
      <button onClick={handleWithdraw}>Withdraw</button>
      <button onClick={() => handleCompound(BigInt(100))}>Compound</button>
      <button onClick={() => handleSweep(BigInt(100))}>Sweep</button>
      <button onClick={handleClose}>Close</button>
      <button onClick={handleEmergencyWithdraw}>Emergency Withdraw</button>
      <button onClick={() => handleSetMinFees(BigInt(10), BigInt(10))}>Set Min Fees</button>
      <button onClick={() => handleSetGridQuantity(BigInt(10))}>Set Grid Quantity</button>
      <button onClick={() => handleSetGridStep(BigInt(5))}>Set Grid Step</button>
      <ul>
        {positions.map((position, index) => (
          <li key={index}>{JSON.stringify(position)}</li>
        ))}
      </ul>
      <ToastContainer />
    </div>
  );
};

export default ManagePositions;