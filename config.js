const databaseUrl = process.env.PG_URL || process.env.DATABASE_URL;

const isLocalDb =
  databaseUrl &&
  (databaseUrl.includes('localhost') ||
   databaseUrl.includes('127.0.0.1'));

const pgSsl = process.env.PG_SSL
  ? process.env.PG_SSL === 'true'
  : !isLocalDb;

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT) || 8080,
  databaseUrl,
  pgSsl,
  pageSize: 20,
};