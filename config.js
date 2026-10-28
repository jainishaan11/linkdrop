// Runtime settings. Everything the app needs from its environment is read here.
module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.PG_URL || process.env.DATABASE_URL,
  pageSize: 20,
};
