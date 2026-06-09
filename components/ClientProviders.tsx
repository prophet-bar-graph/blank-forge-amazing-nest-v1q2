'use client'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'
import { BrandProfileProvider } from '@/components/BrandProfileProvider'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AgentInterceptorProvider>
        <BrandProfileProvider>
          {children}
        </BrandProfileProvider>
      </AgentInterceptorProvider>
    </ErrorBoundary>
  )
}
