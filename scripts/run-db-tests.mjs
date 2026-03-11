#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function parseArgs(argv) {
  const opts = {
    filter: '',
    verbose: false,
    unitOnly: false,
    integrationOnly: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--filter=')) opts.filter = arg.slice('--filter='.length);
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--unit') opts.unitOnly = true;
    else if (arg === '--integration') opts.integrationOnly = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

function logHeader() {
  console.log(`${yellow}========================================${reset}`);
  console.log(`${yellow}OpsOS Intelligence Layer Test Suite${reset}`);
  console.log(`${yellow}========================================${reset}\n`);
}

function getDbUrl() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      'Missing DB URL. Set SUPABASE_DB_URL or DATABASE_URL to a Postgres connection string.'
    );
  }
  return dbUrl;
}

function normalizeDbUrlForTest(dbUrl) {
  // For dev/test runners, force no-verify mode to handle hosted/self-signed chains.
  if (/[?&]sslmode=require/i.test(dbUrl)) {
    return dbUrl.replace(/sslmode=require/gi, 'sslmode=no-verify');
  }
  if (dbUrl.includes('?')) return `${dbUrl}&sslmode=no-verify`;
  return `${dbUrl}?sslmode=no-verify`;
}

async function listSqlFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.test.sql'))
      .map((e) => path.join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}

async function inlineIncludes(filePath, sql) {
  const dir = path.dirname(filePath);
  const root = process.cwd();
  const lines = sql.split(/\r?\n/);
  const resolved = [];
  for (const line of lines) {
    const match = line.match(/^\\i\s+(.+?)\s*$/);
    if (match) {
      const includePath = path.isAbsolute(match[1])
        ? match[1]
        : path.resolve(root, match[1]);
      try {
        const included = await fs.readFile(includePath, 'utf8');
        resolved.push(included);
      } catch {
        // leave as-is if file not found; pg will error with a clearer message
        resolved.push(line);
      }
    } else {
      resolved.push(line);
    }
  }
  return resolved.join('\n');
}

async function runSqlFile(client, filePath, verbose) {
  const name = path.basename(filePath, '.test.sql');
  process.stdout.write(`Running ${name}... `);
  const raw = await fs.readFile(filePath, 'utf8');
  const sql = await inlineIncludes(filePath, raw);

  try {
    await client.query(sql);
    console.log(`${green}PASSED${reset}`);
    return true;
  } catch (err) {
    console.log(`${red}FAILED${reset}`);
    if (verbose) {
      const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
      console.error(message);
    } else {
      console.log('Run with --verbose to see details');
    }
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  logHeader();

  const root = process.cwd();
  const unitDir = path.join(root, 'supabase', 'tests', 'unit');
  const integrationDir = path.join(root, 'supabase', 'tests', 'integration');
  const rawDbUrl = getDbUrl();
  const dbUrl = normalizeDbUrlForTest(rawDbUrl);

  const isSupabaseHost = dbUrl.includes('supabase.co') || dbUrl.includes('supabase.com');
  const requiresSsl = /[?&]sslmode=require/i.test(dbUrl);
  const noVerifySsl = /[?&]sslmode=no-verify/i.test(dbUrl);
  if (noVerifySsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const client = new Client({
    connectionString: dbUrl,
    ssl: (isSupabaseHost || requiresSsl || noVerifySsl) ? { rejectUnauthorized: false } : undefined,
  });

  console.log('Checking database connection...');
  try {
    await client.connect();
    await client.query('SELECT 1');
    console.log(`${green}Connected to database${reset}\n`);
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
    throw new Error(`Cannot connect to database: ${message}`);
  }

  let passed = 0;
  let failed = 0;
  const runGroup = async (label, dir) => {
    const files = await listSqlFiles(dir);
    if (files.length === 0) return;
    console.log(`${yellow}${label}:${reset}`);
    for (const file of files) {
      const fileName = path.basename(file);
      if (opts.filter && !fileName.includes(opts.filter)) continue;
      // Each test file manages its own transaction semantics.
      const ok = await runSqlFile(client, file, opts.verbose);
      if (ok) passed += 1;
      else failed += 1;
    }
    console.log('');
  };

  try {
    if (!opts.integrationOnly) await runGroup('Unit Tests', unitDir);
    if (!opts.unitOnly) await runGroup('Integration Tests', integrationDir);
  } finally {
    await client.end();
  }

  const total = passed + failed;
  console.log(`${yellow}========================================${reset}`);
  console.log(`${yellow}Test Summary${reset}`);
  console.log(`${yellow}========================================${reset}`);
  console.log(`Total:  ${total}`);
  console.log(`${green}Passed: ${passed}${reset}`);
  console.log(`${failed > 0 ? red : green}Failed: ${failed}${reset}\n`);

  if (failed > 0) {
    console.log(`${red}Some tests failed${reset}`);
    process.exit(1);
  }
  console.log(`${green}All tests passed${reset}`);
}

main().catch((err) => {
  console.error(`${red}${err.message || String(err)}${reset}`);
  process.exit(1);
});
