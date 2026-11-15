import './globals.css';
import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/lib/brand';
export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: `${BRAND.name} — rent, tenants, maintenance and executive dashboard`,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.short, statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/favicon-32.png', sizes: '32x32' }, { url: '/icons/icon-192.png', sizes: '192x192' }], apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1d1d1b' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
