import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = {
  title: 'RE-PMS — Property Management',
  description: 'Real Estate Property Management System',
  applicationName: 'RE-PMS',
  appleWebApp: { capable: true, title: 'RE-PMS', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/favicon-32.png', sizes: '32x32' }, { url: '/icons/icon-192.png', sizes: '192x192' }], apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1f3a5f' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
