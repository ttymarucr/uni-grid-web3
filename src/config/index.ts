import { http, createConfig } from '@wagmi/core'
import { base } from '@wagmi/core/chains'
import { injected } from '@wagmi/connectors'

export const config = createConfig({
  chains: [base],
  connectors: [injected({shimDisconnect: true})],
  transports: {
    [base.id]: http('https://base-mainnet.g.alchemy.com/v2/_zTD3BWOgxR-BQ1lHisJL86d8LP8XBaF'),
  },
})