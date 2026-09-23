/**
 * Flattens the Rwandan location tree into one array matching the `Location`
 * schema, ready for a single bulk insert.
 *
 *   model Location {
 *     id       String  @id @default(uuid())
 *     name     String
 *     parentId String?
 *     parent   Location?  @relation("LocationHierarchy", fields: [parentId], references: [id])
 *     children Location[] @relation("LocationHierarchy")
 *   }
 *
 * The source nests Province -> District -> Sector -> Cell -> Village, which the
 * schema models as a **self-relation**: one table, `parentId` pointing at
 * another row's `id`.
 *
 * **UUIDs are generated here** rather than left to the database, because a child
 * cannot reference a parent whose id does not yet exist. Generating both up
 * front turns 2,601 dependent requests into one payload — the whole reason for
 * doing it this way.
 *
 * A parent is always emitted **before** its children, so the array can be
 * inserted in order without a deferred constraint.
 *
 * Usage:
 *   node scripts/build-locations-json.mjs --file scripts/data/rwanda-locations.json
 *
 *   --out <path>       Where to write (default scripts/data/locations-bulk.json)
 *   --only <Province>  Just one province, e.g. --only Kigali
 *   --depth <n>        Stop at a level: 1 province … 5 village (default 5)
 *   --pretty           Indent the output (much larger file)
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const args = process.argv.slice(2)
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const FILE = flag('file', 'scripts/data/rwanda-locations.json')
const OUT = flag('out', 'scripts/data/locations-bulk.json')
const ONLY = flag('only')
const DEPTH = Number(flag('depth', '5'))
const PRETTY = has('pretty')

const LEVELS = ['province', 'district', 'sector', 'cell', 'village']

const data = JSON.parse(fs.readFileSync(path.resolve(FILE), 'utf8'))

if (ONLY && !data[ONLY]) {
  console.error(`Province "${ONLY}" not found. Available: ${Object.keys(data).join(', ')}`)
  process.exit(1)
}

const source = ONLY ? { [ONLY]: data[ONLY] } : data

/** @type {Array<{ id: string, name: string, parentId: string | null }>} */
const rows = []
const counts = { province: 0, district: 0, sector: 0, cell: 0, village: 0 }

/** Children of a node as `[name, subtree]`. Villages are leaf strings. */
function childrenOf(node) {
  if (Array.isArray(node)) return node.map((name) => [name, null])
  if (node && typeof node === 'object') return Object.entries(node)
  return []
}

/**
 * Emits a node, then recurses — so a parent always precedes its children in the
 * array and the insert can run in order.
 */
function walk(name, parentId, node, depth) {
  if (depth >= DEPTH) return

  const id = crypto.randomUUID()
  rows.push({ id, name, parentId })
  counts[LEVELS[depth]]++

  for (const [childName, childNode] of childrenOf(node)) {
    walk(childName, id, childNode, depth + 1)
  }
}

for (const [province, subtree] of Object.entries(source)) {
  // Top level: `parentId` is null, which the schema allows (`String?`).
  walk(province, null, subtree, 0)
}

/* ------------------------------------------------------------------ */
/* Verify before writing — a malformed tree is worse than none          */
/* ------------------------------------------------------------------ */

const ids = new Set(rows.map((r) => r.id))
const seenBefore = new Set()
const problems = []

if (ids.size !== rows.length) {
  problems.push(`duplicate ids: ${rows.length - ids.size}`)
}

for (const row of rows) {
  if (row.parentId !== null) {
    if (!ids.has(row.parentId)) {
      problems.push(`"${row.name}" references a parentId not in the set`)
      break
    }
    if (!seenBefore.has(row.parentId)) {
      problems.push(`"${row.name}" appears before its parent — insert order is wrong`)
      break
    }
  }
  if (!row.name || typeof row.name !== 'string') {
    problems.push(`a row has an empty or non-string name`)
    break
  }
  seenBefore.add(row.id)
}

if (problems.length > 0) {
  console.error('Refusing to write — the generated tree is invalid:')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true })
fs.writeFileSync(path.resolve(OUT), JSON.stringify(rows, null, PRETTY ? 2 : 0))

const bytes = fs.statSync(path.resolve(OUT)).size
console.log(`Wrote ${OUT}`)
console.log(`  ${rows.length.toLocaleString()} rows, ${(bytes / 1024 / 1024).toFixed(1)} MB\n`)
for (const level of LEVELS.slice(0, DEPTH)) {
  console.log(`  ${level.padEnd(9)} ${counts[level].toLocaleString()}`)
}
console.log(`  ${'TOTAL'.padEnd(9)} ${rows.length.toLocaleString()}`)
console.log('\n  verified: ids unique, every parentId resolves, parents precede children')
