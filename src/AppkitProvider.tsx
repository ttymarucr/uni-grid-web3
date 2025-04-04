import { createAppKit } from '@reown/appkit/react'

import { WagmiProvider } from 'wagmi'
import { base } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

// 0. Setup queryClient
const queryClient = new QueryClient()

// 1. Get projectId from https://cloud.reown.com
const projectId = '72542ff6809064e93e2a333a574f466e'

// 2. Create a metadata object - optional
const metadata = {
  name: 'UniGrids',
  description: 'UniGrids is a decentralized liquidity management protocol for Uniswap V3.',
//   url: 'https://example.com', // origin must match your domain & subdomain
//   icons: ['https://avatars.githubusercontent.com/u/179229932']
}

// 3. Set the networks
const networks = [base]

// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
})

// 5. Create modal
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false // Optional - defaults to your Cloud configuration
  }
})

export function AppKitProvider({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}