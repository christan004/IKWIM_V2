import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Droplet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fullName } from '@/api/types'
import { authService } from '@/features/auth/auth.service'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { useSidebarModules } from '@/features/modules/use-sidebar-modules'
import { SidebarNav, SidebarNavSkeleton } from '@/features/modules/components/sidebar-nav'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export function AppLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const { theme, toggle } = useThemeStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // The navigation tree is served by the backend, so adding a module there
  // makes it appear here without a frontend deploy — only its route needs
  // registering (see lib/module-registry.ts).
  const { modules, isLoading, isError } = useSidebarModules()

  async function handleLogout() {
    try {
      // Not best-effort in the way it used to be: the cookies are HttpOnly, so
      // this call is the only thing that can actually end the session. Clearing
      // local state alone would leave a working credential in the browser.
      await authService.logout()
    } catch {
      // If it fails the cookies may survive, but the local state is cleared
      // either way so the user is not left in a half-signed-in shell.
    } finally {
      clearSession()
      navigate('/login', { replace: true })
    }
  }

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?'
    : '?'

  return (
    <div className="flex min-h-svh bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          // Mobile: an off-canvas drawer over the content.
          'fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform',
          /*
           * Desktop: `sticky`, not the `static` it used to be.
           *
           * `static` put the sidebar in normal flow, so a long page scrolled it
           * away with the content — and the nav's own `overflow-y-auto` never
           * engaged, because `flex-1` resolved against a container that kept
           * growing. Pinning it to the viewport height makes the **nav** the
           * thing that scrolls, so the menu stays put however far the page runs.
           *
           * `self-start` is load-bearing: a flex child is stretched to the
           * row's full height by default, and an element as tall as its scroll
           * container has nothing to stick within.
           *
           * `inset-y-auto` undoes the mobile `inset-y-0` — with both `top: 0`
           * and `bottom: 0` applied, `top` would fight `h-svh`.
           */
          'lg:sticky lg:inset-y-auto lg:top-0 lg:h-svh lg:self-start lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Droplet className="size-5 fill-current" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Petro<span className="text-primary">X</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </Button>
        </div>

        <nav
          className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 py-5"
          onClick={() => setSidebarOpen(false)}
        >
          <ul className="space-y-1">
            <li>
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )
                }
              >
                <LayoutDashboard className="size-4 shrink-0" />
                Dashboard
              </NavLink>
            </li>
          </ul>

          {isLoading && <SidebarNavSkeleton />}

          {isError && (
            <p className="px-3 text-xs text-sidebar-foreground/50">
              Couldn&rsquo;t load the menu.
            </p>
          )}

          {!isLoading && !isError && modules.length > 0 && <SidebarNav nodes={modules} />}
        </nav>

        <p className="border-t border-sidebar-border px-5 py-4 text-xs text-sidebar-foreground/40">
          PetroX Management Console
        </p>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {initials}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-medium leading-tight">
                      {user ? fullName(user) : ''}
                    </span>
                    <span className="block text-xs leading-tight text-muted-foreground">
                      {user?.role}
                    </span>
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <UserIcon className="size-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
