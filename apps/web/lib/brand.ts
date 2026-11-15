/**
 * Company branding. The group runs the system as "Hamdan Properties"; for a future sale or another customer,
 * set NEXT_PUBLIC_BRAND_NAME / _SHORT / _TAGLINE at build time (see .env.example) — nothing else changes.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Hamdan Properties',
  short: process.env.NEXT_PUBLIC_BRAND_SHORT || 'Hamdan Properties',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Property Management System',
  logo: '/brand/logo-full.png',
  mark: '/brand/logo-mark.png',
};
