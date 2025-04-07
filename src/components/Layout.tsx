import React from "react";
import {
  useAppKit,
  useDisconnect,
  useAppKitAccount,
} from "@reown/appkit/react";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { address, isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  return (
    <div className="container mx-auto p-4">
      <header>
        <h1>Grid Liquidiy Management
        <div className="flex float-right text-lg">
          {isConnected ? (
            <div className="flex items-center">
              <div className="m-2 pr-2 h-10 green-card rounded flex items-center" >
                <img src={`https://effigy.im/a/${address}.svg`} className="rounded h-10 pr-2"/>
                {`${address?.slice(0, 6)}...${address?.slice(-4)}`}
              </div>
              <button
                onClick={() => disconnect()}
                className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center">
            <button
              onClick={() => open({ view: "Connect", namespace: "eip155" })}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Connect Wallet
            </button>
            </div>
          )}
        </div>
        </h1>
      </header>
      <main>{children}</main>
    </div>
  );
};

export default Layout;
