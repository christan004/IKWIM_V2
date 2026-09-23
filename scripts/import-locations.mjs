/**
 * Imports the Rwandan location hierarchy into `POST /locations`.
 *
 *   Province -> District -> Sector -> Cell -> Village    (17,437 records)
 *
 * Uses **`POST /locations/builk`** (note the spelling — `/locations/bulk` is a
 * 404). It takes an **array** of `{ name, parentId? }`, the mirror of
 * `/locations`, which rejects an array.
 *
 * The batch does **not** nest: `children` and `locations` keys are ignored, so
 * a parent's id is still needed before its children can be sent. The tree is
 * therefore walked level by level, with **one request per parent** carrying all
 * of its children at once — 17,437 records in roughly 2,600 calls rather than
 * 17,437.
 *
 * `parentId` must be a valid UUID when present, so it is **omitted entirely**
 * for provinces rather than sent as `""` (which the API rejects).
 *
 * ⚠️ A single invalid item fails the **whole batch** (`[3].name: …`), so nothing
 * partial is written — which is what makes resuming safe.
 *
 * Usage:
 *   node scripts/import-locations.mjs --file <path/to/data.json> [options]
 *
 *   --dry-run          Walk the tree and report counts without writing.
 *   --only <Province>  Import a single province, e.g. --only Kigali
 *   --depth <n>        Stop at a level: 1 province … 5 village (default 5).
 *   --resume <file>    Progress file to read and write (default .locations-progress.json)
 *
 * Progress is written after every successful create, so an interrupted run can
 * be restarted with the same command and will skip what already exists.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const API = process.env.API_URL ?? 'https://petrox.quicko.rw/api/v1'
const EMAIL = process.env.API_EMAIL ?? 'admin@petrox.local'
const PASSWORD = process.env.API_PASSWORD

const args = process.argv.slice(2)
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const FILE = flag('file')
const ONLY = flag('only')
const DEPTH = Number(flag('depth', '5'))
const DRY_RUN = has('dry-run')
const PROGRESS_FILE = flag('resume', '.locations-progress.json')

const LEVELS = ['province', 'district', 'sector', 'cell', 'village']

if (!FILE) {
  console.error('Missing --file <path to data.json>')
  process.exit(1)
}
if (!DRY_RUN && !PASSWORD) {
  console.error('Set API_PASSWORD in the environment (not passed as an argument).')
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/* Progress — keyed by the path through the tree, so it is stable      */
/* across runs regardless of object key order.                         */
/* ------------------------------------------------------------------ */

/** @type {Record<string, string>} pathKey -> created id */
let done = {}
if (fs.existsSync(PROGRESS_FILE)) {
  done = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
  console.log(`Resuming — ${Object.keys(done).length.toLocaleString()} already imported.`)
}

let sinceFlush = 0
function remember(key, id) {
  done[key] = id
  // Flushed in batches: writing 17k times would dominate the runtime, and a
  // crash loses at most 25 records, which the next run simply recreates.
  if (++sinceFlush >= 25) flush()
}
function flush() {
  if (sinceFlush === 0) return
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(done))
  sinceFlush = 0
}

/* ------------------------------------------------------------------ */
/* Auth — cookie based, so the session is a cookie header we carry      */
/* ------------------------------------------------------------------ */

let cookie = ''

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  // The tokens arrive as Set-Cookie; fetch does not keep a jar, so they are
  // collected once and replayed on every request.
  cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ')
  if (!cookie) throw new Error('Login returned no cookies')
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

let created = 0
let skipped = 0
let requests = 0
const startedAt = Date.now()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Creates a batch of siblings and returns their ids, in the order sent.
 *
 * Retries on 5xx and on a 401 (by re-logging in) — a transient failure over a
 * long run would otherwise waste everything before it. A **400 is not retried**:
 * the payload is wrong, so repeating it changes nothing.
 */
async function createBatch(items, attempt = 1) {
  requests++

  let res
  try {
    res = await fetch(`${API}/locations/builk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(items),
    })
  } catch (err) {
    if (attempt <= 5) {
      await sleep(1000 * attempt)
      return createBatch(items, attempt + 1)
    }
    throw err
  }

  if (res.status === 401 && attempt <= 5) {
    await login()
    return createBatch(items, attempt + 1)
  }
  if (res.status >= 500 && attempt <= 5) {
    await sleep(1000 * attempt)
    return createBatch(items, attempt + 1)
  }

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const details = (json?.error?.details ?? [])
      .map((d) => `${d.field}: ${d.message}`)
      .join('; ')
    const detail = details || json?.error?.message || `HTTP ${res.status}`
    throw new Error(`Batch of ${items.length} failed — ${detail}`)
  }

  const rows = Array.isArray(json.data) ? json.data : [json.data]
  if (rows.length !== items.length) {
    // Ids are matched back by position, so a length mismatch would silently
    // attach children to the wrong parent. Better to stop than corrupt the tree.
    throw new Error(
      `Sent ${items.length} but received ${rows.length} ids — cannot match them safely.`,
    )
  }
  return rows.map((r) => r.id)
}

/* ------------------------------------------------------------------ */
/* Walk — breadth-wise: one request per parent, carrying its children  */
/* ------------------------------------------------------------------ */

const counts = { province: 0, district: 0, sector: 0, cell: 0, village: 0 }

/** Children of a node, as `[name, subtree]` pairs. Villages are leaves. */
function childrenOf(node) {
  if (Array.isArray(node)) return node.map((name) => [name, null])
  if (node && typeof node === 'object') return Object.entries(node)
  return []
}

/**
 * Creates every child of one parent in a single request, then recurses into
 * each child.
 *
 * Already-imported children are filtered out first, so a resumed run sends only
 * what is missing — and sends nothing at all when a whole branch is done.
 *
 * @param parentId  the created parent's id, or null at the top level
 * @param node      the parent's subtree
 * @param depth     0-based level of the *children* being created
 * @param pathKey   the parent's ancestry, '' at the top
 */
async function importChildren(parentId, node, depth, pathKey) {
  if (depth >= DEPTH) return

  const level = LEVELS[depth]
  const children = childrenOf(node)
  if (children.length === 0) return

  counts[level] += children.length

  /** @type {Array<{name: string, subtree: unknown, key: string, id?: string}>} */
  const entries = children.map(([name, subtree]) => {
    const key = pathKey ? `${pathKey}/${name}` : name
    return { name, subtree, key, id: done[key] }
  })

  const missing = entries.filter((e) => !e.id)
  skipped += entries.length - missing.length

  if (missing.length > 0) {
    if (DRY_RUN) {
      for (const entry of missing) entry.id = `dry-${entry.key}`
    } else {
      // parentId is omitted entirely at the top level: the API rejects an empty
      // string, and requires a valid UUID whenever the key is present.
      const items = missing.map((e) => (parentId ? { name: e.name, parentId } : { name: e.name }))
      const ids = await createBatch(items)
      missing.forEach((entry, index) => {
        entry.id = ids[index]
        remember(entry.key, ids[index])
      })
      created += missing.length
      report()
    }
  }

  for (const entry of entries) {
    await importChildren(entry.id, entry.subtree, depth + 1, entry.key)
  }
}

let lastReport = 0
function report() {
  // Throttled: one line a second keeps the run legible without drowning it.
  if (Date.now() - lastReport < 1000) return
  lastReport = Date.now()
  const elapsed = (Date.now() - startedAt) / 1000
  const rate = created > 0 ? (created / elapsed).toFixed(0) : '0'
  console.log(
    `  ${created.toLocaleString()} created, ${skipped.toLocaleString()} skipped — ` +
      `${requests.toLocaleString()} requests (${rate}/s)`,
  )
}

/* ------------------------------------------------------------------ */

async function main() {
  const data = JSON.parse(fs.readFileSync(path.resolve(FILE), 'utf8'))
  const provinces = ONLY ? { [ONLY]: data[ONLY] } : data

  if (ONLY && !data[ONLY]) {
    console.error(`Province "${ONLY}" not found. Available: ${Object.keys(data).join(', ')}`)
    process.exit(1)
  }

  console.log(DRY_RUN ? 'DRY RUN — nothing will be written.\n' : `Importing into ${API}\n`)

  if (!DRY_RUN) await login()

  try {
    // The top level has no parent, so the provinces object is itself the
    // "children" of nothing — one batch creates all five, then each recurses.
    await importChildren(null, provinces, 0, '')
  } finally {
    // Always persist what succeeded, even on an error or Ctrl-C.
    if (!DRY_RUN) flush()
  }

  console.log('\nDone.')
  for (const level of LEVELS.slice(0, DEPTH)) {
    console.log(`  ${level.padEnd(9)} ${counts[level].toLocaleString()}`)
  }
  console.log(`  ${'TOTAL'.padEnd(9)} ${Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()}`)
  if (!DRY_RUN) {
    console.log(
      `
  created ${created.toLocaleString()}, skipped ${skipped.toLocaleString()} (already present)` +
        `
  in ${requests.toLocaleString()} requests instead of ${(created + skipped).toLocaleString()}`,
    )
  }
}

main().catch((err) => {
  flush()
  console.error(`\nFailed: ${err.message}`)
  console.error('Progress saved — rerun the same command to resume.')
  process.exit(1)
})
