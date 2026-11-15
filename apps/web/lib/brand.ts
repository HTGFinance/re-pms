/**
 * Company branding. The group runs the system as "Hamdan Real Estate"; for a future sale or another customer,
 * set NEXT_PUBLIC_BRAND_NAME / _SHORT / _TAGLINE at build time (see .env.example) — nothing else changes.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Hamdan Real Estate',
  short: process.env.NEXT_PUBLIC_BRAND_SHORT || 'Hamdan RE',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Property Management System',
};
