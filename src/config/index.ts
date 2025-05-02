import { http, createConfig, fallback } from "@wagmi/core";
import { base, arbitrum } from "@wagmi/core/chains";
import { injected } from "@wagmi/connectors";
import deploymentConfig from "./deploymentConfig.json";
import { DeploymentConfigMap } from "../types";

export const config = createConfig({
  chains: [base, arbitrum],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [base.id]: fallback([
      http("https://base.llamarpc.com"),
      http(
        `https://base-mainnet.g.alchemy.com/v2/${
          import.meta.env.VITE_ALCHEMY_API_KEY
        }`
      ),
    ]),
    [arbitrum.id]: fallback([
      http(""),
      http(
        `https://arb-mainnet.g.alchemy.com/v2/${
          import.meta.env.VITE_ALCHEMY_API_KEY
        }`
      ),
    ]),
  },
});

export const deploymentConfigMap = deploymentConfig as DeploymentConfigMap;
