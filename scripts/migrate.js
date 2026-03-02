// migrate.js — run DDL migration against Supabase via direct pg connection
// Usage: node scripts/migrate.js
//
// Requires the DB password from:
//   Supabase Dashboard → Settings → Database → Connection string → Password
//
// Connection: session pooler (port 5432) in us-west-2

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'iqdyxdeihkccwmbgglre';
const POOLER_HOST = 'aws-0-us-west-2.pooler.supabase.com';
const DB_PASSWORD = process.env.DB_PASSWORD || 'E@XcpGPBQf6Y';

async function migrate() {
  const client = new Client({
    host: POOLER_HOST,
    port: 5432,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  const sqlFile = path.join(__dirname, '..', 'supabase', 'migrations', 'setup.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  await client.connect();
  console.log(`Connected to ${PROJECT_REF} (${POOLER_HOST})`);

  await client.query(sql);
  console.log('Migration complete');

  const res = await client.query(`
    SELECT 'companies' as tbl, count(*)::int as rows FROM companies
    UNION ALL SELECT 'technicians', count(*)::int FROM technicians
    UNION ALL SELECT 'jobs', count(*)::int FROM jobs
    UNION ALL SELECT 'optimization_runs', count(*)::int FROM optimization_runs
  `);
  console.table(res.rows);

  await client.end();
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
