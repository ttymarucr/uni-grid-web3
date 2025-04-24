import React, { useState } from "react";
import { config } from "../../config";
import { useChainId, useChains } from "wagmi";
import { switchChain } from "@wagmi/core";

const ChainSelector = () => {
  const chainId = useChainId({ config });
  const chains = useChains({ config });

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDropdownVisible(false);
    }
  };

  return (
    <div onBlur={handleBlur} className="relative inline-block">
      <button
        className="m-2 bg-gray-900 text-white text-sm md:text-base text-nowrap px-4 py-2 rounded hover:bg-gray-800 h-8 md:h-10 hover:cursor-pointer"
        onClick={() => setIsDropdownVisible(true)}
      >
        {chains.find((c) => c.id === chainId)?.name || "Select Chain"}
      </button>
      {isDropdownVisible && (
        <div className="absolute mt-2 bg-white text-gray-800 text-sm md:text-base border shadow-lg h-8 md:h-10">
          {chains.map((availableChain) => (
            <button
              key={availableChain.id}
              onClick={() =>
                switchChain(config, { chainId: availableChain.id })
              }
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
