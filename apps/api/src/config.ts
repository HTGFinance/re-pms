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
  brandName: process.env.BRAND_NAME || 'Hamdan Properties',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  timeZone: 'Asia/Muscat',
  /** Public address of the app (e.g. https://properties.example.om) — used in tenant invitation links. */
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  inviteDays: parseInt(process.env.INVITE_EXPIRY_DAYS || '7', 10),
  smtp: { host: process.env.SMTP_HOST || '', port: parseInt(process.env.SMTP_PORT || '587', 10), secure: process.env.SMTP_SECURE === 'true', user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '', from: process.env.SMTP_FROM || '' },
};
if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'change-me-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}
