import type { NextConfig } from 'next';

/** The browser calls /api/* on the same origin; Next forwards it to the API (keeps the login cookie first-party). */
const API_URL = process.env.API_URL || 'http://localhost:4000';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }]; },
};
export default config;
