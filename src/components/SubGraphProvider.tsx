import { cacheExchange, createClient, fetchExchange, Provider } from "urql";
import { useChainId } from "wagmi";
import { deploymentContractsMap } from "../config";
import { useCallback } from "react";

export const SubGraphProvider = ({ children }) => {
  const chainId = useChainId();
  const subgraphId = deploymentContractsMap[chainId].subgraphId;
  const client = useCallback(() => {
    return createClient({
      url: `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`,
      fetchOptions: {
        headers: {
            Authorization: "Bearer 517d67b3e5862e4b45f60ed4cacd2a30",
        },
      },
      exchanges: [cacheExchange, fetchExchange],
    });
  }, [subgraphId]);

  return <Provider value={client()}>{children}</Provider>;
};
