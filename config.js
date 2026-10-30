module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.PG_URL || process.env.DATABASE_URL,
  pgSsl: process.env.PG_SSL === 'true',
  pageSize: 20,
};