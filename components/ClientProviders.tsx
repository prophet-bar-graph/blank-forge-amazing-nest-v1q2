'use client'

import { useState, useEffect } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'
import { HydrationGuard } from '@/components/HydrationGuard'
import { BrandProfileProvider } from '@/components/BrandProfileProvider'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // During SSR/prerendering, render children directly without providers
  if (!mounted) return <>{children}</>

  return (
    <ErrorBoundary>
      <AgentInterceptorProvider>
        <HydrationGuard>
          <BrandProfileProvider>
            {children}
          </BrandProfileProvider>
        </HydrationGuard>
      </AgentInterceptorProvider>
    </ErrorBoundary>
  )
}
