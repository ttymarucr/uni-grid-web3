import React from "react";
import {
  useAppKit,
  useDisconnect,
  useAppKitAccount,
} from "@reown/appkit/react";
import ChainSelector from "./ChainSelector";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  return (
    <div className="container mx-auto p-4">
      <header>
        <div className="flex flex-col items-center md:justify-between">
        <h1>
          Grid Liquidity Management
        </h1>
        <div>
            {isConnected ? (
              <div className="flex items-center md:justify-start justify-between w-full">
                <div className="m-2 pr-2 h-8 md:h-10 green-card rounded flex items-center text-sm md:text-base">
                  <img
                    src={`https://effigy.im/a/${address}.svg`}
                    className="rounded h-8 md:h-10 pr-2"
                  />
                  {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
                </div>
                <ChainSelector />
                <button
                  onClick={() => disconnect()}
                  className="m-2 bg-gray-900 hover:bg-gray-800 text-white text-sm md:text-base px-4 py-2 rounded h-8 md:h-10 hover:cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center m-2">
                <button
                  onClick={() => open({ view: "Connect", namespace: "eip155" })}
                  className="bg-blue-500 text-white text-sm md:text-base px-4 py-2 rounded h-8 md:h-10 hover:cursor-pointer"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
          </div>
      </header>
      {isConnected && <main>{children}</main>}
    </div>
  );
};

export default Layout;
