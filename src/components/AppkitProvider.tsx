import { createAppKit } from '@reown/appkit/react'

import { WagmiProvider } from 'wagmi'
import { base, arbitrum } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

// 0. Setup queryClient
const queryClient = new QueryClient()

// 1. Get projectId from https://cloud.reown.com
const projectId = `${import.meta.env.VITE_APPKIT_PROJECT_ID}`

// 2. Create a metadata object - optional
const metadata = {
  name: 'UniGrids',
  description: 'UniGrids is a decentralized liquidity management tool for Uniswap V3.',
  url: `${import.meta.env.VITE_APPKIT_URL}`, 
  icons: [`${import.meta.env.VITE_APPKIT_ICON}`],
}

// 3. Set the networks
const networks = [base, arbitrum]

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

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}