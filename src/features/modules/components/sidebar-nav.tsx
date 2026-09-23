import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavNode } from '@/features/modules/use-sidebar-modules'

/** True when this branch contains the currently open route. */
function containsPath(node: NavNode, pathname: string): boolean {
  if (node.path && (pathname === node.path || pathname.startsWith(`${node.path}/`))) return true
  return node.children.some((child) => containsPath(child, pathname))
}

function NavBranch({ node, depth }: { node: NavNode; depth: number }) {
  const location = useLocation()
  const hasChildren = node.children.length > 0
  const isActiveBranch = containsPath(node, location.pathname)

  // Groups start open when the current route lives inside them, so a reload
  // never hides the item the user is looking at.
  const [open, setOpen] = useState(isActiveBranch)
  useEffect(() => {
    if (isActiveBranch) setOpen(true)
  }, [isActiveBranch])

  const Icon = node.icon
  const indent = depth === 0 ? 'px-3' : depth === 1 ? 'pl-8 pr-3' : 'pl-12 pr-3'

  // A group: renders a toggle rather than a link.
  if (hasChildren) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'flex w-full items-center gap-3 rounded-md py-2 text-sm transition-colors',
            indent,
            isActiveBranch
              ? 'text-sidebar-foreground'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          )}
        >
          {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
          <span className="flex-1 truncate text-left">{node.name}</span>
          <ChevronRight
            className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')}
          />
        </button>

        {open && (
          <ul className="mt-1 space-y-1">
            {node.children.map((child) => (
              <NavBranch key={child.id} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  // A leaf with no registered route: show it, but make clear it goes nowhere,
  // so a new backend module is visibly unwired rather than silently missing.
  if (!node.path) {
    return (
      <li>
        <span
          title="This module has no screen yet"
          className={cn(
            'flex cursor-not-allowed items-center gap-3 rounded-md py-2 text-sm text-sidebar-foreground/35',
            indent,
          )}
        >
          {Icon ? <Icon className="size-4 shrink-0" /> : <Circle className="size-2 shrink-0" />}
          <span className="flex-1 truncate">{node.name}</span>
        </span>
      </li>
    )
  }

  return (
    <li>
      <NavLink
        to={node.path}
        end
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-md py-2 text-sm transition-colors',
            indent,
            isActive
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          )
        }
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : <Circle className="size-2 shrink-0" />}
        <span className="flex-1 truncate">{node.name}</span>
      </NavLink>
    </li>
  )
}

export function SidebarNav({ nodes }: { nodes: NavNode[] }) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <NavBranch key={node.id} node={node} depth={0} />
      ))}
    </ul>
  )
}

export function SidebarNavSkeleton() {
  return (
    <ul className="space-y-1.5 px-3" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="h-8 animate-pulse rounded-md bg-sidebar-accent" />
      ))}
    </ul>
  )
}
