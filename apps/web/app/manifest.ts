import type { MetadataRoute } from 'next';

/** Lets staff, tenants and technicians add RE-PMS to their phone or tablet home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RE-PMS — Property Management',
    short_name: 'RE-PMS',
    description: 'Rent, tenants, maintenance and executive dashboard',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f6f9',
    theme_color: '#1f3a5f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Executive dashboard', url: '/executive' },
      { name: 'Rent recovery', url: '/recovery' },
      { name: 'Tenant app', url: '/t' },
    ],
  };
}
