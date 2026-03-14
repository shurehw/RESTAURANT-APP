#!/usr/bin/env node

/**
 * Structural test: validates import boundaries across the codebase.
 *
 * Enforced rules:
 *   1. lib/database/  → cannot import from components/ or app/
 *   2. lib/ai/        → cannot import from components/ or app/api/
 *   3. app/api/       → cannot import from components/
 *   4. lib/enforcement/ → cannot import from components/ or app/
 *   5. lib/etl/       → cannot import from components/ or app/
 *
 * Run: node scripts/check-import-boundaries.mjs
 * CI:  npm run check:boundaries
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, posix } from 'path'

const ROOT = join(import.meta.dirname, '..')

// ── Rules ──────────────────────────────────────────────────────────────
// Each rule: { name, sourceGlob, forbiddenImports[] }
const RULES = [
  {
    name: 'lib/database/ cannot import from components/ or app/',
    sourceDir: 'lib/database',
    forbidden: ['components/', 'app/'],
  },
  {
    name: 'lib/ai/ cannot import from components/ or app/api/',
    sourceDir: 'lib/ai',
    forbidden: ['components/', 'app/api/'],
  },
  {
    name: 'lib/enforcement/ cannot import from components/ or app/',
    sourceDir: 'lib/enforcement',
    forbidden: ['components/', 'app/'],
  },
  {
    name: 'lib/etl/ cannot import from components/ or app/',
    sourceDir: 'lib/etl',
    forbidden: ['components/', 'app/'],
  },
  {
    name: 'lib/cv/ cannot import from components/ or app/',
    sourceDir: 'lib/cv',
    forbidden: ['components/', 'app/'],
  },
  {
    name: 'lib/feedback/ cannot import from components/ or app/',
    sourceDir: 'lib/feedback',
    forbidden: ['components/', 'app/'],
  },
  {
    name: 'app/api/ cannot import from components/',
    sourceDir: 'app/api',
    forbidden: ['components/'],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────

function collectFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
  const results = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
        results.push(...collectFiles(full, extensions))
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(full)
      }
    }
  } catch {
    // directory doesn't exist, skip
  }
  return results
}

// Match import/require statements — captures the module specifier
const IMPORT_RE = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g

function extractImports(content) {
  const imports = []
  let match
  while ((match = IMPORT_RE.exec(content)) !== null) {
    imports.push(match[1] || match[2])
  }
  return imports
}

function resolveAliasedImport(specifier) {
  // @/ alias → project root
  if (specifier.startsWith('@/')) {
    return specifier.slice(2) // strip @/ → relative to root
  }
  return null // not an aliased import we care about
}

// ── Main ───────────────────────────────────────────────────────────────

let violations = 0
let filesChecked = 0

for (const rule of RULES) {
  const sourceDir = join(ROOT, rule.sourceDir)
  const files = collectFiles(sourceDir)

  for (const file of files) {
    filesChecked++
    const content = readFileSync(file, 'utf-8')
    const imports = extractImports(content)
    const relFile = relative(ROOT, file).replace(/\\/g, '/')

    for (const imp of imports) {
      const resolved = resolveAliasedImport(imp)
      if (!resolved) continue // skip node_modules / relative imports within same module

      for (const forbidden of rule.forbidden) {
        if (resolved.startsWith(forbidden)) {
          violations++
          console.error(
            `  VIOLATION: ${relFile}\n` +
            `    imports "${imp}" (resolves to ${resolved})\n` +
            `    Rule: ${rule.name}\n`
          )
        }
      }
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────

console.log(`\nImport boundary check complete.`)
console.log(`  Files checked: ${filesChecked}`)
console.log(`  Rules checked: ${RULES.length}`)

if (violations > 0) {
  console.error(`  VIOLATIONS: ${violations}\n`)
  console.error(`Fix the above violations before committing.`)
  console.error(`See docs/domain/api-conventions.md for import boundary rules.`)
  process.exit(1)
} else {
  console.log(`  Violations: 0 ✓\n`)
  process.exit(0)
}
