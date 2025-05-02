import React, { useState } from "react";
import { config } from "../../config";
import { useChainId, useChains } from "wagmi";
import { switchChain } from "@wagmi/core";
import Button from "../Button";

interface ChainSelectorProps {
  onSwitch?: (chainId: number) => void;
}

const ChainSelector: React.FC<ChainSelectorProps> = ({ onSwitch }) => {
  const chainId = useChainId({ config });
  const chains = useChains({ config });

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDropdownVisible(false);
    }
  };

  const handleSwitchChain = (chainId: number) => {
    switchChain(config, { chainId });
    setIsDropdownVisible(false);
    if (onSwitch) {
      onSwitch(chainId);
    }
  };

  return (
    <div onBlur={handleBlur} className="mr-2 relative inline-block">
      <Button
        buttonStyle="primary"
        onClick={() => setIsDropdownVisible(true)}
      >
        {chains.find((c) => c.id === chainId)?.name || "Select Chain"}
      </Button>
      {isDropdownVisible && (
        <div className="absolute mt-2 bg-white text-gray-800 text-sm md:text-base border shadow-lg h-10">
          {chains.map((availableChain) => (
            <button
              key={availableChain.id}
              onClick={() => {
                handleSwitchChain(availableChain.id);
              }}
              className={`block px-4 py-2 text-left w-full hover:cursor-pointer ${
                chainId === availableChain.id ? "bg-gray-200" : "bg-white"
              } hover:bg-gray-100`}
            >
              {availableChain.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChainSelector;
