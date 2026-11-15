/** Central configuration, read from environment variables (see .env.example). */
export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'repms',
    password: process.env.DB_PASSWORD || 'repms',
    database: process.env.DB_NAME || 'repms',
    ssl: process.env.DB_SSL === 'true',
  },
  brandName: process.env.BRAND_NAME || 'Hamdan Real Estate',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  timeZone: 'Asia/Muscat',
};
if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'change-me-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}
