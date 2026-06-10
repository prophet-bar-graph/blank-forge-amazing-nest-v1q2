'use client'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'
import { BrandProfileProvider } from '@/components/BrandProfileProvider'
import { SSOGuard } from '@/components/SSOGuard'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SSOGuard>
        <AgentInterceptorProvider>
          <BrandProfileProvider>
            {children}
          </BrandProfileProvider>
        </AgentInterceptorProvider>
      </SSOGuard>
    </ErrorBoundary>
  )
}
