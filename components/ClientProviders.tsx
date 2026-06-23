'use client'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'
import { BrandProfileProvider } from '@/components/BrandProfileProvider'
import { ChatHistoryProvider } from '@/components/ChatHistoryProvider'
import { SSOGuard } from '@/components/SSOGuard'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <SSOGuard>
        <AgentInterceptorProvider>
          <BrandProfileProvider>
            <ChatHistoryProvider>
              {children}
            </ChatHistoryProvider>
          </BrandProfileProvider>
        </AgentInterceptorProvider>
      </SSOGuard>
    </ErrorBoundary>
  )
}
