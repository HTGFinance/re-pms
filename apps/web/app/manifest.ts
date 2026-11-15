import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/** Lets staff, tenants and technicians add the app to their phone or tablet home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline}`,
    short_name: BRAND.short,
    description: 'Rent, tenants, maintenance and executive dashboard',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4f4f1',
    theme_color: '#1d1d1b',
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
