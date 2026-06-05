import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import './globals.css'
import { IframeLoggerInit } from '@/components/IframeLoggerInit'
import ClientProviders from '@/components/ClientProviders'
import { SSOGuard } from '@/components/SSOGuard'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif', display: 'swap', weight: ['500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Writing Studio',
  // Brand-agnostic; layout is a server component so it can't read from the client-side BrandProfileProvider.
  // The brand-specific surfaces all render on the client and use useBrandProfile() directly.
  description: 'A brand-grounded writing studio: compose, refine, and learn the brand framework.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body className={inter.className} suppressHydrationWarning>
        <IframeLoggerInit />
        <SSOGuard>
          <ClientProviders>
            {children}
          </ClientProviders>
        </SSOGuard>
      </body>
    </html>
  )
}
