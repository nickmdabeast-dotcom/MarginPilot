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

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const POOLER_HOST = process.env.SUPABASE_POOLER_HOST;
const DB_PASSWORD = process.env.DB_PASSWORD;

async function migrate() {
  if (!PROJECT_REF || !POOLER_HOST || !DB_PASSWORD) {
    throw new Error(
      'Missing SUPABASE_PROJECT_REF, SUPABASE_POOLER_HOST, or DB_PASSWORD env var'
    );
  }

  const client = new Client({
    host: POOLER_HOST,
    port: 5432,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  await client.connect();
  console.log(`Connected to ${PROJECT_REF} (${POOLER_HOST})`);

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    console.log(`Applied ${file}`);
  }

  console.log('Migration complete');

  const res = await client.query(`
    SELECT 'companies' as tbl, count(*)::int as rows FROM companies
    UNION ALL SELECT 'profiles', count(*)::int FROM profiles
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
