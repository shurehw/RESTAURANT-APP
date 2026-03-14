#!/usr/bin/env node

/**
 * Stale Reference Detector
 *
 * Scans all markdown files in docs/ and CLAUDE.md for file path references
 * and verifies they actually exist. Catches doc-code drift.
 *
 * Run: node scripts/check-stale-refs.mjs
 * CI:  npm run check:refs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'

const ROOT = join(import.meta.dirname, '..')

// ── Collect markdown files to scan ─────────────────────────────────────

function collectMarkdown(dir) {
  const results = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '_archive') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...collectMarkdown(full))
      } else if (entry.name.endsWith('.md')) {
        results.push(full)
      }
    }
  } catch { /* skip */ }
  return results
}

// ── Extract file references from markdown ──────────────────────────────

// Patterns we look for:
// 1. Backtick paths: `lib/database/tipsee.ts`
// 2. Markdown links: [text](path/to/file.ext)
// 3. Table cell paths: `supabase/migrations/225_sales_pace.sql`

const BACKTICK_PATH_RE = /`([a-zA-Z][\w/.@-]*\.\w{1,5})`/g
const LINK_PATH_RE = /\]\(([^)]+\.\w{1,5})\)/g

// File extensions we consider as code/config references
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'sql', 'json', 'yaml', 'yml', 'toml',
  'sh', 'py', 'css', 'md',
])

function isCodePath(p) {
  const ext = p.split('.').pop()?.toLowerCase()
  return CODE_EXTENSIONS.has(ext)
}

function extractRefs(content) {
  const refs = new Set()

  let match
  while ((match = BACKTICK_PATH_RE.exec(content)) !== null) {
    const p = match[1]
    if (isCodePath(p) && !p.startsWith('http') && !p.startsWith('@/') && !p.includes('*')) {
      refs.add(p)
    }
  }

  while ((match = LINK_PATH_RE.exec(content)) !== null) {
    const p = match[1]
    if (!p.startsWith('http') && !p.startsWith('#') && !p.startsWith('mailto:')) {
      // Strip anchor fragments
      const clean = p.split('#')[0]
      if (clean) refs.add(clean)
    }
  }

  return refs
}

// ── Resolve and check ──────────────────────────────────────────────────

// Historical docs that reference removed code (proforma system).
// These are kept as-is for audit trail — skip them in stale ref checks.
const IGNORED_FILES = new Set([
  'docs/P0_DIFF_SUMMARY.md',
  'docs/P0_IMPLEMENTATION_SUMMARY.md',
])

// Subdirectories to search when a bare filename is referenced
const SEARCH_DIRS = [
  'lib/database', 'lib/ai', 'lib/enforcement', 'lib/etl', 'lib/cv',
  'lib/integrations', 'lib/feedback', 'lib/chatbot',
  'python-services/scheduler', 'python-services/demand_forecaster',
]

function findBareFile(filename) {
  for (const dir of SEARCH_DIRS) {
    if (existsSync(join(ROOT, dir, filename))) return true
  }
  return false
}

let staleCount = 0
let checkedCount = 0
let filesScanned = 0

// Scan docs/ directory + root-level markdown files
const docsDir = join(ROOT, 'docs')
const mdFiles = [
  ...collectMarkdown(docsDir),
  join(ROOT, 'CLAUDE.md'),
].filter(f => existsSync(f))

for (const mdFile of mdFiles) {
  const relMdFile = relative(ROOT, mdFile).replace(/\\/g, '/')

  // Skip ignored historical docs
  if (IGNORED_FILES.has(relMdFile)) continue

  const content = readFileSync(mdFile, 'utf-8')
  const refs = extractRefs(content)
  filesScanned++

  for (const ref of refs) {
    checkedCount++

    // Try resolving relative to the markdown file's directory first
    const fromMdDir = join(dirname(mdFile), ref)
    // Then try relative to project root
    const fromRoot = join(ROOT, ref)
    // Then try as a bare filename in common subdirectories
    const bareFound = findBareFile(ref)

    if (!existsSync(fromMdDir) && !existsSync(fromRoot) && !bareFound) {
      staleCount++
      console.error(
        `  STALE: ${relMdFile}\n` +
        `    references "${ref}" — file not found\n`
      )
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────

console.log(`\nStale reference check complete.`)
console.log(`  Files scanned: ${filesScanned}`)
console.log(`  References checked: ${checkedCount}`)

if (staleCount > 0) {
  console.error(`  STALE REFERENCES: ${staleCount}\n`)
  console.error(`Update or remove the above references in your docs.`)
  process.exit(1)
} else {
  console.log(`  Stale references: 0 ✓\n`)
  process.exit(0)
}
