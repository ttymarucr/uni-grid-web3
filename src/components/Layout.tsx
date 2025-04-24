import React from "react";
import {
  useAppKit,
  useDisconnect,
  useAppKitAccount,
} from "@reown/appkit/react";
import ChainSelector from "./ChainSelector";
import { PowerIcon } from "@heroicons/react/24/outline";
import Button from "./Button";

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
                <div className="m-2 pr-2 h-10 green-card rounded flex items-center text-sm md:text-base">
                  <img
                    src={`https://effigy.im/a/${address}.svg`}
                    className="rounded h-10 pr-2"
                  />
                  {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
                </div>
                <ChainSelector />
                <Button
                  onClick={() => disconnect()}
                >
                  <PowerIcon className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center m-2">
                <Button
                  onClick={() => open({ view: "Connect", namespace: "eip155" })}
                >
                  Connect Wallet
                </Button>
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
