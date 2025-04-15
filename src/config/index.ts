import { http, createConfig } from "@wagmi/core";
import { base } from "@wagmi/core/chains";
import { injected } from "@wagmi/connectors";
import trustedTokens from "./trustedTokens.json";
import deploymentContracts from "./deploymentContracts.json";
import { DeploymentContractsMap, TrustedTokensMap } from "../types";

export const config = createConfig({
  chains: [base],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [base.id]: http(
      "https://base-mainnet.g.alchemy.com/v2/_zTD3BWOgxR-BQ1lHisJL86d8LP8XBaF"
    ),
  },
});

export const trustedTokensMap = trustedTokens as TrustedTokensMap;
export const deploymentContractsMap = deploymentContracts as DeploymentContractsMap;

