import { cacheExchange, createClient, fetchExchange, Provider } from "urql";
import { useChainId } from "wagmi";
import { deploymentConfigMap } from "../config";
import { ReactNode, useCallback } from "react";
export const SubGraphProvider = ({ children }: { children: ReactNode }) => {
  const chainId = useChainId();
  const subgraphId = deploymentConfigMap[chainId].subgraphId;
  const client = useCallback(() => {
    return createClient({
      url: `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`,
      fetchOptions: {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUBGRAPH_API_KEY}`,
        },
      },
      exchanges: [cacheExchange, fetchExchange],
    });
  }, [subgraphId]);

  return <Provider value={client()}>{children}</Provider>;
};
