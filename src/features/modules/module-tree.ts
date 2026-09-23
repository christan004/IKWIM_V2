import type { ModuleLevel, ModuleListNode, ModulePermission } from '@/api/types'

export const MODULE_LEVELS: ModuleLevel[] = ['module', 'service', 'feature']

/**
 * A module flattened into a row, keeping its depth so the hierarchy can be
 * re-drawn by indentation.
 */
export interface ModuleTreeNode {
  id: string
  name: string
  code: string
  icon: string | null
  level: ModuleLevel
  depth: number
  parentName: string | null
  /**
   * The parent's id, or `null` at the top level. Reordering is **per level**, so
   * this is what identifies which siblings compete with each other.
   */
  parentId: string | null
  /** Ancestry, e.g. "Supply Chain › Order". */
  path: string
  childCount: number
  /** The backend's ordering value within this node's own parent. */
  sorting: number
  permissions: ModulePermission[]
  createdAt: string
}

function bySortingThenName(a: ModuleListNode, b: ModuleListNode) {
  if (a.sorting !== b.sorting) return a.sorting - b.sorting
  return a.name.localeCompare(b.name)
}

/**
 * Indexes every module by id, keeping whichever copy carries children.
 *
 * `/modules/list` repeats each child module: once nested under its parent, and
 * again at the top level. **The two copies are not identical** — the nested one
 * often has an empty `children` array while the root-level one holds the real
 * subtree (`ORDER` is nested childless under `SUPPLY_CHAIN`, but appears at
 * root with its three features). Taking the first copy seen would silently drop
 * grandchildren, so the richer copy wins.
 */
function indexById(nodes: ModuleListNode[], index = new Map<string, ModuleListNode>()) {
  for (const node of nodes) {
    const existing = index.get(node.id)
    if (!existing || (node.children?.length ?? 0) > (existing.children?.length ?? 0)) {
      index.set(node.id, node)
    }
    indexById(node.children ?? [], index)
  }
  return index
}

function walk(
  nodes: ModuleListNode[],
  depth: number,
  parentName: string | null,
  parentId: string | null,
  prefix: string,
  index: Map<string, ModuleListNode>,
  seen: Set<string>,
  out: ModuleTreeNode[],
): ModuleTreeNode[] {
  for (const node of [...nodes].sort(bySortingThenName)) {
    // Cycles are not expected, but a self-referencing parentId would otherwise
    // recurse forever.
    if (seen.has(node.id)) continue
    seen.add(node.id)

    // Always walk the indexed copy, which holds the real subtree.
    const canonical = index.get(node.id) ?? node
    const children = canonical.children ?? []
    const displayName = canonical.name || '(no name)'
    const path = prefix ? `${prefix} › ${displayName}` : displayName

    out.push({
      id: canonical.id,
      name: canonical.name,
      code: canonical.code,
      icon: canonical.icon,
      level: MODULE_LEVELS[Math.min(depth, MODULE_LEVELS.length - 1)],
      depth,
      parentName,
      parentId,
      path,
      childCount: children.length,
      sorting: canonical.sorting,
      permissions: canonical.permissions ?? [],
      createdAt: canonical.createdAt,
    })
    walk(children, depth + 1, displayName, canonical.id, path, index, seen, out)
  }
  return out
}

/**
 * Flattens `/modules/list` into depth-first rows, so a child always appears
 * directly beneath its parent. Shared by the modules table and the role
 * permission picker so both render the same hierarchy.
 */
export function toModuleTree(data: ModuleListNode[]): ModuleTreeNode[] {
  const index = indexById(data)
  // Genuine roots only — a child repeated at the top level still carries its
  // `parentId`, and is reached by walking its parent instead.
  const roots = [...index.values()].filter((node) => node.parentId === null)
  return walk(roots, 0, null, null, '', index, new Set(), [])
}
