# PetroX – Web Management Console (IKWIM V2)

React + TypeScript + Vite admin console for the PetroX backend. Structured to match the
previous console at `PETROX/web/` so both codebases read the same way.

## Stack

- React 19 + TypeScript + Vite
- React Router – client-side routing
- TanStack Query – server state
- Zustand – auth session (user and permissions cached in `localStorage`; tokens live in `HttpOnly` cookies)
- Tailwind CSS v4 + shadcn/ui-style primitives (`src/components/ui/`)
- React Hook Form + Zod – forms
- sonner – toasts, lucide-react – icons

### One difference from the previous console: no codegen

The old project generates its entire API layer with **orval** from the backend's
OpenAPI document. This backend is Fastify and does not serve a spec — `/api-docs-json`,
`/openapi.json`, `/docs-json` and friends all 404 — so `src/api/services/` is
hand-written instead, and `src/api/types.ts` is hand-kept.

Everything else (folder layout, `@/` alias, kebab-case filenames, the axios instance
with its refresh interceptor, the Zustand auth store, guard components) follows the same
shape, so if a spec is added later, dropping orval in means replacing `src/api/services/`
with `src/api/generated/` and little else.

## Running locally

```bash
npm install
cp .env.example .env
npm run dev
```

Opens at <http://localhost:5173>. Requests to `/api/*` are proxied to the API by Vite,
so the browser stays same-origin and **no CORS setup is needed in development**.

Sign in with `admin@petrox.local` / `Ikwim@12345`.

| Script            | What it does                               |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Dev server with HMR                        |
| `npm run build`   | Typecheck (`tsc -b`) then production build |
| `npm run preview` | Serve the built `dist/` locally            |
| `npm run lint`    | oxlint                                     |

| Variable           | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `VITE_API_URL`     | Prefixed onto every request. `/api/v1` in dev; the absolute origin in production. |
| `API_PROXY_TARGET` | Where the dev proxy forwards `/api`. Not exposed to the browser.                |

## Project structure

Code is organised **by feature**, so everything one area needs — its service, hooks,
components, and pages — lives in one folder. Only genuinely shared code sits at the top
level. This differs from the previous console, which keeps all 28 pages flat in
`src/pages/`; that stops scaling once features grow past a single file.

```
src/
├── api/
│   ├── axios-instance.ts   axios + auth interceptor; apiClient() unwraps the envelope
│   └── types.ts            hand-kept request/response types (shared across features)
├── features/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   └── pages/          login, forgot-password, reset-password
│   └── modules/
│       ├── modules.service.ts
│       ├── use-modules.ts          table rows + create mutation
│       ├── use-sidebar-modules.ts  nav tree
│       ├── components/             sidebar-nav, module-form-dialog
│       └── pages/                  modules-page
├── components/
│   ├── ui/                 shadcn/ui primitives (button, input, dialog, select, …)
│   ├── data-table.tsx      search + pagination table used by every list screen
│   ├── form-dialog.tsx     modal wrapper for create/edit forms
│   ├── brand-panel-background.tsx
│   └── full-page-spinner.tsx
├── hooks/                  cross-feature hooks (use-permissions, use-session-restore)
├── layouts/app-layout.tsx  sidebar + topbar shell for signed-in screens
├── lib/
│   ├── error-message.ts    errorMessage / errorCode / errorStatus / fieldErrors
│   ├── module-registry.ts  module code -> route + icon
│   └── utils.ts            cn()
├── pages/                  screens that belong to no feature (dashboard, profile, 404)
├── routes/protected-route.tsx
└── stores/                 auth-store, theme-store
```

### Adding a feature

1. **Folder** — create `src/features/<feature>/`.
2. **Types** — add request/response shapes to `src/api/types.ts`.
3. **Service** — `<feature>.service.ts` calling `apiClient`.
4. **Hooks** — `use-<feature>.ts` wrapping the service in `useQuery` / `useMutation`,
   exporting the query key so mutations can invalidate it.
5. **Page** — `pages/<feature>-page.tsx` using `DataTable`, with `FormDialog` +
   RHF + Zod for the create form and `errorMessage(err)` in a `toast.error(...)`.
6. **Route** — register it in `App.tsx`; wrap in `RequirePermissionRoute` to gate it.
7. **Nav** — if it is a backend module, add its code to `lib/module-registry.ts`;
   if it is console administration, add a link in `layouts/app-layout.tsx`.

## The API

Base URL: `https://petrox.quicko.rw/api/v1`

### Response envelopes

Every endpoint wraps its payload. `apiClient()` unwraps `data`, so screens work with the
inner object directly.

```jsonc
// success
{ "success": true, "data": { /* payload */ } }

// failure
{
  "success": false,
  "error": {
    "statusCode": 400,
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "requestId": "req-4",
    "details": [{ "field": "password", "code": "too_small", "message": "Must contain at least 8 characters" }]
  }
}
```

Read errors with the `src/lib/error-message.ts` helpers: `errorMessage(err)` for a
banner or toast, `errorCode(err)` to branch on `UNAUTHORIZED` / `USER_NOT_FOUND` /
`FORBIDDEN`, and `fieldErrors(err)` to feed RHF's `setError`.

### Auth endpoints

**`POST /auth/login`** — body `{ email, password }`

```jsonc
// 200 → data
{
  "accessToken": "eyJ…",           // JWT, ~15 min
  "refreshToken": "DcP78Ete…",     // opaque, single-use
  "expiresAt": "2026-09-07T08:08:23.618Z",
  "user": { "id": "a35ece8b-…", "email": "…", "firstName": "System", "lastName": "Administrator", "role": "Administrator" },
  "permissions": ["users.read", "roles.manage", "…"]
}
```

**`POST /auth/refresh`** — body `{ refreshToken }` → **the same payload as login**,
including `user` and `permissions`.

**`POST /auth/logout`** — body `{ refreshToken }`, with the `Authorization` header set.

**`POST /auth/password-reset/request`** — body `{ email }` → `201 { token?, expiresAt }`.
Returns `404 USER_NOT_FOUND` for an unknown address, `400 VALIDATION_ERROR` for a
malformed one.

**`POST /auth/password-reset/confirm`** — body `{ token, password }` → `200`, sets the
new password. Failure modes, all handled by `reset-password-page.tsx`:

| Response                                       | Meaning                          | UI                              |
| ---------------------------------------------- | -------------------------------- | ------------------------------- |
| `401 UNAUTHORIZED` "Invalid or expired reset token" | Well-formed token, wrong/expired/already used | "This link is no longer valid" |
| `400 VALIDATION_ERROR` `details[].field = "token"`  | Token too short or malformed     | Same dead-end screen            |
| `400 VALIDATION_ERROR` `details[].field = "password"` | Password under 8 characters   | Inline field error              |
| `429 RATE_LIMIT_EXCEEDED`                      | Too many attempts                | Banner                          |

Reset tokens are **single-use**: redeeming one makes it return 401 on any further
attempt. Minimum password length is **8 characters**.

> **There is no endpoint to validate a token on its own.** `/auth/password-reset/verify`,
> `/validate`, and `/check` all 404, so the page cannot pre-check the link — validity is
> only known once the form is submitted. If a verify endpoint is added later, the page
> can check on mount and show the dead-end state before the user types a password.

### 🔐 Authentication is cookie-based

`POST /auth/login` returns **no tokens** — only `user` and `permissions`. The credentials
arrive as cookies the browser stores itself:

```
Set-Cookie: access_token=…;  Path=/; HttpOnly; SameSite=Lax
Set-Cookie: refresh_token=…; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
```

Three things follow, and together they explain the whole auth layer:

| Because | Therefore |
| --- | --- |
| `HttpOnly` | The tokens are unreadable from JavaScript, so **nothing is stored** and there is no `Authorization` header. That is the security win: injected script cannot exfiltrate them. |
| Cookies are opt-in for XHR | **`withCredentials: true`** is mandatory on the axios instance — without it every request is anonymous. |
| `SameSite=Lax` | The browser must be **same-origin with the API**, so the dev proxy is a functional requirement, not a CORS convenience. |

> 🔴 **The Vite proxy is load-bearing.** `VITE_API_URL` is `/api/v1` (relative), so requests
> go to the dev server and are forwarded upstream — the browser only ever sees one origin.
> The proxy also sets **`cookieDomainRewrite: ''`**, which rebinds cookies from the upstream
> host to the dev host; without it the browser would refuse to store them.
>
> **In production the app must be served from the same origin as the API** (or behind the
> same reverse proxy). Deploying it to a different host would break sign-in entirely, and no
> frontend change can work around `SameSite=Lax`.

**Logout must call the API.** Only the server can expire an `HttpOnly` cookie; it responds
with both set to `Max-Age=0`. Clearing local state alone would leave a working credential in
the browser.

### ⚠️ Refresh tokens are single-use and rotate

Redeeming a refresh token immediately invalidates it and returns a new one; reusing a
spent token returns `401 Invalid refresh token`.

`POST /auth/refresh` **takes no body** — the token rides along as a cookie, and the response
sets the rotated pair. Refresh calls are still **single-flight**: two parallel refreshes
would each redeem the same cookie, one wins and the other 401s, destroying a valid session.
The shared in-flight promise in `axios-instance.ts` is a *correctness* requirement, not a
performance tweak.

### There is no `/auth/me`

It returns 404. Since `/auth/refresh` returns the full user and permissions, session restore
on page load calls it instead (`hooks/use-session-restore.ts`).

> ⚠️ **The client cannot tell whether it is signed in.** The cookies are invisible to
> JavaScript, so the persisted `user` is the only hint that a session *may* exist — and it
> can be stale, since cookies expire independently of `localStorage`. Boot therefore calls
> refresh once: success replaces the persisted copy with fresh data (so a role change takes
> effect), failure clears it and redirects. Without that, a stale entry would render the full
> shell for someone with no session, and every request behind it would 401.

The persisted `user` and `permissions` are a **cache for first paint**, not a credential:
they grant nothing, because every request is authorised by the cookie.

### `GET /modules/sidebar` — the navigation tree

Requires authentication. Returns a recursive tree; **the depth a node sits at is what
gives it meaning**, since no field states its level:

| Depth | Level     | Example              | Behaviour                         |
| ----- | --------- | -------------------- | --------------------------------- |
| 0     | `module`  | `SUPPLY_CHAIN`       | Top-level sidebar section         |
| 1     | `service` | `ORDER`              | Collapsible group inside a module |
| 2+    | `feature` | `NOMINATION`, `PFI`  | Leaf that navigates to a route    |

A node with `children` renders as a collapsible group regardless of depth; a node without
them renders as a link.

```jsonc
{ "id": "…", "name": "Supply Chain", "code": "SUPPLY_CHAIN", "sorting": 0, "children": [ … ] }
```

**The payload carries no route path, icon, or permission.** `src/lib/module-registry.ts`
maps each `code` to a path and a lucide icon — **that is the one file to edit when the
backend adds a module**:

```ts
MODULES:          { path: '/modules', icon: Blocks, title: 'Modules' },
SYSTEM_SETTINGS:  { icon: Cog },   // no path — it is a grouping node
```

Every screen, including Modules and Roles, comes from the module tree — nothing is
hardcoded into the sidebar. Deleting `MODULES` on the backend removes its nav entry;
recreating it restores it, with no frontend change.

Routes are **generated from that registry** in `App.tsx`, so a sidebar link can never
point at a route that doesn't exist. Anything without a real page yet falls back to
`ModulePlaceholderPage`; building a screen means adding one line to `REAL_PAGES`.

A code the registry doesn't know still renders — greyed out and non-clickable — so a new
backend module shows up visibly unwired rather than silently vanishing.

> ⚠️ **Grouping nodes need an icon too, and it is easy to miss.** A feature with no icon
> falls back to a visible bullet, but a **module** falls back to a blank spacer — so the row
> simply looks misaligned rather than obviously unwired. The PSS module and its service went
> in without icons for exactly that reason.
>
> **Two rules, both checked against the live tree:** every node the sidebar returns has a
> registry icon, and **no icon repeats inside a single branch** — a repeat there stops the
> icon distinguishing one row from another. Repeats *across* branches are fine (`Container`
> serves both Transporters and Cuves).
>
> Enforcing the second rule shifted four pre-existing entries: the supply-chain module took
> `Route`, its service `Workflow`, settings `SlidersHorizontal`, and Transporters
> `Container` — freeing `Warehouse` for Deports and `Truck` for Vehicles, which are the
> leaves those icons actually describe.

> **`sorting` is `0` on every node the API currently returns**, so it cannot order
> anything. The sidebar sorts by `sorting` then falls back to name, keeping the order
> stable and alphabetical until the backend populates real values.

> **The tree is not permission-filtered client-side.** It is assumed the API already
> returns only what the signed-in user may see. If that is not the case, add a permission
> field to the payload and filter in `use-sidebar-modules.ts`.

### `PUT /modules/edit/:id` — renaming a module

```jsonc
{ "name": "Supply Chain", "icon": "Truck" }
```

> ⚠️ **The id goes in the path, not the body.** A body `id` is accepted but ignored — the
> path selects the record. Every other spelling 404s as `ROUTE_NOT_FOUND`: `PUT /modules/:id`,
> `PATCH /modules/:id`, `PUT /modules/update/:id`, and a bodyless `PUT /modules/edit`. Only
> `/modules/edit/:id` answers `RESOURCE_NOT_FOUND` for an unknown id, which is how the real
> route was identified.

> ⚠️ **Only `name` is required.** `icon` is optional and accepts `null` or an empty string, so
> a blank field clears it. Sending `code` is validated (`>=2 characters`) and then **ignored** —
> the backend derives it from the name at creation and it never changes afterwards. The edit
> dialog says so, since the sidebar keys off the code rather than the name.

**Re-parenting is not possible here** — the endpoint takes only `name` and `icon`, so the
parent control is hidden when editing rather than shown and silently ignored.

> ⚠️ **`icon` is `null` on every live module.** The backend stores the column but nothing
> populates it, and the sidebar takes its icons from `module-registry.ts` instead. The field is
> wired because the endpoint accepts it, but setting it has no visible effect today.

### `POST /modules/create` — creating modules

**Takes an array**, even for a single module. `name` is the only required field.

```jsonc
// request
[{ "name": "Supply Chain", "icon": "Truck", "parentId": null }]

// 200 → data
[{ "id": "…", "name": "Supply Chain", "icon": "Truck", "code": "SUPPLY_CHAIN",
   "parentId": null, "sorting": 0, "createdAt": "…" }]
```

- **`code` is generated by the backend** from `name` (`"Supply Chain"` → `SUPPLY_CHAIN`)
  and is not an input.
- `parentId` nests the module: under a module it becomes a service, under a service a
  feature.
- **`sorting` is ignored** — sending `5` stores `0`, which is why every node in the tree
  has `sorting: 0`. The form omits the field rather than offer one that does nothing.
- A duplicate name returns `409 RESOURCE_CONFLICT` (the generated code collides on
  `Module_code_key`). The form maps this onto the name input.
- Validation errors are keyed by array position — `[0].name`, not `name`.

Creating a module also **generates five permissions** for it — `read`, `create`, `edit`,
`delete`, `manage` — named after the module (`supply.chain.read`, etc.).

### `PUT /modules/change-module/sorting` — reordering

Takes an **array**, so a whole level goes in one call:

```json
[{ "categoryId": "00f5cc85-…", "sortingNumber": 2 }]
```

> **Ordering is per level, not global.** Siblings are numbered only against each other, so
> a module, its service and its feature can each be `1`. The **Reorder** dialog therefore
> groups rows by parent and reorders one group at a time — the level being edited is
> renumbered from 1, and no other level is touched.

Because the endpoint accepts a batch, the dialog sends the **entire level** rather than the
single row that moved. Renumbering `1…n` in one request keeps the sequence contiguous,
where per-move updates would leave gaps and ties.

> ⚠️ **`sortingNumber` must be greater than zero** — `0` is rejected with `Too small`, so
> the sequence is **1-based**. A numeric string is coerced (the example above sends `"2"`),
> but the client sends a number. **`PUT` only**; `POST` and `PATCH` are not routed. The
> field is `categoryId`, not `moduleId`.

Every module currently sits at `sorting: 0` except `GENERAL_SETTINGS`, so the tree falls
back to the name tiebreak in `bySortingThenName` until a level is explicitly ordered.

**`DELETE /modules/delete/:id`** → `{ count: 1 }`. Unknown id → `404 RESOURCE_NOT_FOUND`.

> ⚠️ **Send no `Content-Type` header.** The request has no body, and Fastify rejects an
> empty body with `400 FST_ERR_CTP_EMPTY_JSON_BODY` when the header claims JSON. Axios
> sets it by default, so `modules.service.ts` passes `{ 'Content-Type': null }` to strip
> it. Any future bodyless request needs the same treatment.

**Deleting a parent does not cascade.** Its children are **promoted to top-level
modules** with `parentId` cleared — verified against the live API — so nothing is
orphaned, but the tree reshapes. The confirm dialog says how many children will move.

Deleting a module also removes its permissions, so any role holding them loses them.

**There is still no update endpoint** — `PATCH`/`PUT` on `/modules/:id` both 404 — so a
module cannot be renamed or re-parented after creation.

### `GET /modules/list` — the administration view

Returns **every** module with its `permissions`, unlike `/modules/sidebar` which omits
permissions and hides some modules. This is what the modules table reads.

```jsonc
{ "id": "…", "name": "Supply Chain", "icon": null, "code": "SUPPLY_CHAIN",
  "parentId": null, "sorting": 0, "createdAt": "…",
  "permissions": [{ "id": "…", "moduleId": "…", "name": "View Supply Chain",
                    "code": "supply.chain.read", "description": null, "createdAt": "…" }],
  "children": [ … ] }
```

### ⚠️ `/modules/list` repeats children, inconsistently

Every child module appears **twice**: nested under its parent, and again as a top-level
entry with its `parentId` still set. Worse, **the two copies differ** — the nested copy
often has an empty `children` array while the root-level copy holds the real subtree.

`ORDER`, for example, is nested childless under `SUPPLY_CHAIN` but appears at root with
its three features. So neither naive strategy works:

- Taking only `parentId === null` entries **loses** the nested-only modules.
- Taking the first copy of each id **loses grandchildren** (this dropped `NOMINATION`,
  `PFI`, and `T1_VALIDATION` — caught in verification).

`use-modules.ts` therefore indexes every id keeping **whichever copy has more children**,
then walks from the genuine roots. Verified: 15 rows for 15 distinct modules, no
duplicates, hierarchy intact.

**A flat, non-repeating list would let all of that logic be deleted.**

### Roles

| Endpoint           | Notes                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `GET /roles`       | Paginated (`{ items, pagination }`). Each role carries its permissions through a join table: `permissions[].permission.code`. |
| `POST /roles`      | Body `{ name, permissionIds? }` → `201`. `permissionIds` is **optional** — a role can be created with none. |
| `DELETE /roles/:id`| `200`. Fixed roles are rejected with `409 RELATION_CONFLICT`.          |

- Duplicate name → `409 RESOURCE_CONFLICT` (`Role_name_key`), mapped onto the name input.
- Unknown permission id → `409 RELATION_CONFLICT`, surfaced as a toast.
- `isFixed` marks seeded roles (Administrator). The UI hides the delete action for them
  rather than offering it and having the API refuse.
- `PATCH`/`PUT` on `/roles/:id` both 404. Editing goes through
  `POST /roles/assign-permissions` instead.

**`PUT /roles/assign-permissions/:roleId`** — body `{ name, permissionIds }`

Grants permissions to a role and sets its name. **The method and path both matter**:
`POST` and `PATCH` on the same path return 404; only `PUT` with the role id in the path
works.

> ⚠️ **Additive only — it cannot revoke.** Verified against the live API: sending a
> subset leaves the omitted permissions in place, and sending `[]` removes nothing.
>
> | Role has              | Send            | Result                     |
> | --------------------- | --------------- | -------------------------- |
> | `read, create`        | `[edit]`        | `read, create, edit`       |
> | `read, create, edit`  | `[read]`        | `read, create, edit` (unchanged) |
> | `read, create, edit`  | `[]`            | `read, create, edit` (unchanged) |
>
> So the edit dialog shows already-granted permissions **ticked and locked** with a lock
> icon, rather than offering an untick that would silently do nothing. Re-sending an
> existing permission is safe — it does not create duplicate join rows.
>
> **Revoking needs a backend endpoint** (or replace semantics on this one).

> ⚠️ **`name` is written verbatim.** Sending `""` **blanks the role's name** rather than
> leaving it unchanged — this happened to the Administrator role during probing and had
> to be restored. The client always sends the intended name, never an empty string.

**There is no `/permissions` endpoint** (404). The permission picker sources its options
from `/modules/list`, which returns every module with the five permissions generated for
it — verified to cover every permission already assigned to the Administrator role.

The picker renders the **same indented tree as the modules table**, both built by
`features/modules/module-tree.ts` so the hierarchy can never drift between the two
screens.

#### ⚠️ `.manage` does **not** imply a module's other permissions

Every module has exactly five permissions and always includes `.manage`, which reads as
"everything on this module". **The backend does not treat it that way** — permission
checks match codes exactly, so holding `roles.manage` does not satisfy a `roles.read`
check.

An earlier version of the picker collapsed a full selection down to just `.manage`. That
looked tidy but **locked the Administrator account out of `/roles` and `/users`**: the
role went from 8 permissions to `["dashboard.manage", "supply.chain.manage"]`, and every
`.read` check began failing with 403.

So *Select all* now sends **every** permission id, `.manage` included, and toggling one
permission never touches another. `features/roles/permission-rules.ts` is deliberately
the only place that decides this — if the backend is ever changed to expand `.manage`
server-side, collapsing can be reintroduced there and nowhere else.

### Users

Two endpoints write to a user, and **their methods are opposites** — an easy trap:

| Endpoint | Method | Body |
| --- | --- | --- |
| `/users/:id` | **PUT** (`PATCH` → 404) | partial update, ≥1 recognised field |
| `/users/:id/site` | **PATCH** (`PUT`/`POST` → 404) | `{ siteId }` |

**Site assignment uses `PATCH /users/:id/site`**, which takes `siteId` on its own.

> ⚠️ **`PUT /users/:id` rejects `siteId` alone**, with `_root: At least one field is
> required` — the same error an *empty* body returns, so it is not counted as a field in its
> own right there. That is why the dedicated endpoint exists and is what the dialog uses.

> ⚠️ **There is no way to unassign.** `{}`, `""` and `null` are all rejected with
> `Must be a valid UUID`, so a user's site can be changed but not cleared through this
> endpoint.

> **`position` is an enum** on `PUT /users/:id`, named by the API's own rejection:
> `superAdmin` · `siteManager` · `clientAdmin` · `clientUser` — all four verified accepted.
> The assign dialog **shows it read-only** rather than offering it: this endpoint does not
> take it, so an editable control would imply it were saved alongside the site.

A user record carries `siteId` and `position`, so the table shows the current posting and the
dialog reseeds from it — the button reads **Assign site** or **Reassign** accordingly. The
site *name* needs the sites list, which belongs to the PSS module, so the column and picker
are gated on `pss.read`; without it the assignment still works, it just cannot name the site.


| Endpoint                 | Notes                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| `GET /users`             | Paginated (`{ items, pagination }`), same envelope as `/roles`.    |
| `POST /users`            | Body `{ email, password, pin, firstName, lastName, phone, roleId }`. |
| `PUT /users/status/:id`  | Toggles `isActive`. No body. Returns the updated user.            |

### ⚠️ `PUT /users/status/:id` is a blind toggle

It **flips** `isActive` rather than setting it — there is no way to request a specific
state, so a duplicate call silently undoes the first. The switch in the table is disabled
while its own request is in flight for that reason.

Like `DELETE /modules/delete/:id`, it takes **no body**, so the `Content-Type` header must
be stripped (`{ 'Content-Type': null }`) or Fastify returns
`400 FST_ERR_CTP_EMPTY_JSON_BODY`.

The signed-in user's own switch is disabled — deactivating yourself would end your session
with no way back, and there is no endpoint to reactivate an account you can no longer sign
in to.

Verified field rules: **`email`, `password`, `firstName`, `lastName`, and `roleId` are
required; `pin` and `phone` are optional.** `password` must be at least 8 characters, and
`pin` is **4–8 digits** (not a fixed 6). Empty optional fields are omitted from the
payload rather than sent as `""`.

The role dropdown is sourced from `GET /roles`, filtered to active roles.

**Password and PIN can be generated** — `features/users/credentials.ts` builds both from
`crypto.getRandomValues`, never `Math.random`. Passwords are 12 characters with at least
one lower, upper, digit and symbol, and exclude glyphs that are easily misread
(`0O1lI5S2Z`) since the credential is read off a screen and typed by someone else. The
password field can be revealed, and a warning appears once either value is generated,
because neither can be retrieved after the dialog closes.

**There is no delete endpoint for users** — `DELETE /users/:id` and `/users/delete/:id`
both 404 — so the page is create-only and test accounts cannot be removed through the
API.

> **Previously `/users` returned 403** because the routes were still gated on
> `system.users.*` after the module was recreated as `USERS`. That has been fixed on the
> backend — both endpoints now work. The page keeps a dedicated explainer for a
> `FORBIDDEN` response so a recurrence reads as a gating mismatch rather than a generic
> load failure.

### Units (items)

| Endpoint                       | Notes                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| `GET /items/units`             | **Flat array** — not paginated, unlike `/users` and `/roles`. |
| `POST /items/units`            | Body `{ name, code }`, both required. Returns `201`.          |
| `PUT /items/units/:id`         | Replaces name and code. `PATCH` and `/update/:id` both 404.   |
| `PUT /items/units/status/:id`  | Toggles `active` ↔ `inactive`. No body.                       |

The list returns **only `{ id, name, code, status }`** — no `createdAt`/`updatedAt`,
though the create, update, and status responses do include them. The table shows a status
switch rather than a created date for that reason.

> ⚠️ `PUT /items/units/status/:id` is a **blind toggle**, exactly like
> `PUT /users/status/:id`: it flips rather than sets, so a duplicate call undoes the
> first. The switch is disabled while its own request is in flight. It also takes **no
> body**, so `Content-Type` must be stripped (`{ 'Content-Type': null }`) or Fastify
> returns `400 FST_ERR_CTP_EMPTY_JSON_BODY`.

**Inactive units are hidden from the item form's dropdowns**, but a unit already
referenced by the item being edited is kept — otherwise editing an item would silently
drop its own base unit.

**There is no delete endpoint**, so editing is the only way to correct a unit once it
exists — which is why the table exposes an edit action rather than create-only.

### ⚠️ `POST /items/units` enforces no uniqueness

Name and code are both unrestricted: posting `{ "name": "Kilogram", "code": "KG" }` three
times creates three separate units, and a different name with an existing code is
accepted too. Verified against the live API.

`unit-form-dialog.tsx` therefore guards client-side, case-insensitively, on **both** name
and code, excluding the row being edited so an unchanged save is allowed. This is a
frontend-only mitigation — anything posting directly to the API can still create
duplicates, so **a unique index on `code` belongs on the backend**.

### Items

| Endpoint                | Notes                                                          |
| ----------------------- | -------------------------------------------------------------- |
| `GET /items`            | **Nested tree, flat array** — not paginated.                     |
| `GET /items/:id`        | **Flat** record with `parentId` and `status`.                    |
| `POST /items`           | Body `{ name, descriptions?, parentId?, baseUnitId, units[] }`.  |
| `PUT /items/:id`        | Same body. `PATCH` and `DELETE` both 404.                        |
| `PUT /items/status/:id` | Toggles `active` ↔ `inactive`. No body.                          |

Only **`name` and `baseUnitId` are required**.

> ⚠️ **The list and detail endpoints return different shapes.**
>
> `GET /items` is a **tree**: children nest under an `items` array, and nodes carry
> `{ id, name, baseUnitId, descriptions, items }` — **no `parentId` and no `status`**.
> Parentage is implied by nesting, so `use-items.ts` flattens the tree and reconstructs
> `parentId` while walking it.
>
> `GET /items/:id` is **flat**: `{ id, name, descriptions, parentId, baseUnitId, status,
> createdAt, updatedAt }` — with `parentId` and `status`, but no `items`.

> ⚠️ **The field is `descriptions`, plural**, in both request and response — not
> `description`.

> ⚠️ **`PUT /items/:id` returns `data: []`**, an empty array rather than the updated
> item, even though the change persists. Callers must refetch; the mutation invalidates
> the list and the success toast uses the submitted name.

> ⚠️ **The `units` array is write-only.** Create and update accept it, but **no endpoint
> ever returns it** — not the tree, not the detail. So an item's existing units cannot be
> pre-filled when editing; the form says so, and starts that section empty.

> ⚠️ **`factorialValue` must be a number.** A numeric string is rejected with
> `units[0].factorialValue: expected number, received string`. The form keeps it as text
> for the input and coerces on submit.

**Inactive items are not filtered out of `GET /items`** — status filtering is the
client's job if it is wanted.

The form blocks three things the API does not: listing the base unit again as an
alternate (it is implicitly 1:1), listing the same unit twice, and selecting an item's
own descendant as its parent (which would create a cycle).

> The earlier `500 INTERNAL_ERROR` on `POST /items` has been **fixed** — create now works
> and is verified end-to-end.

### Clients

Client users and the organisations they belong to.

| Endpoint                      | Notes                                            |
| ----------------------------- | ------------------------------------------------ |
| `GET /clients`                | ⚠️ **Paginated**, and lists **users**, not orgs. |
| `GET /clients/:id`            | Detail — same shape as a list row.               |
| `POST /clients`               | JSON. A **discriminated union** — see below.     |
| `PUT /clients/:id`            | A **true patch** — any subset.                   |
| `PATCH /clients/:id/status`   | 🔴 **`PATCH`**, not `PUT`.                       |
| `DELETE /clients/:id`         | Hard delete.                                     |

> 🔴 **`position` is the discriminator for the whole body, not a plain field.** The two
> branches take different shapes, confirmed by the API's own
> `Invalid discriminator value. Expected 'clientAdmin' | 'clientUser'`:
>
> | position | also requires | meaning |
> | --- | --- | --- |
> | `clientAdmin` | `clientDetails` | **creates the client organisation** too |
> | `clientUser` | `clientId` | joins an organisation that already exists |
>
> The form switches shape on the control and builds each body separately, so it never sends
> fields the other branch would reject. It is **locked when editing** — switching branch is
> not something the update endpoint can express.

> 🔴 **`roleId`, `phone` and `pin` are all optional**, despite appearing in the documented
> example. Only `email`, `password`, `firstName`, `lastName` and the branch field are
> required — and inside `clientDetails`, only **`clientCode`, `pin` and `discountType`**. The
> other nine details fields are optional and omitted when blank.

> 🔴 **There is no endpoint listing client organisations.** `clientId` appears only as a bare
> id on a user, so the organisation picker is **reconstructed** from the client list: users
> are grouped by `clientId`, and each group is named after its `clientAdmin` — the user who
> created it. Verified that `clientId` is never a client-user id, and that several users can
> share one. If an organisation endpoint ships, replace `organizations` in `use-clients.ts`.

> ⚠️ **Status is `isActive` (boolean)**, not the `status: 'active' | 'inactive'` string every
> other resource here uses.

> ⚠️ **`PUT` is a genuine patch** — `At least one field is required` is the only rule. The
> form sends **only what changed**, so an untouched password is never overwritten with a
> blank. `position` alone does **not** satisfy the rule: it is the discriminator, not a field.

Shared field rules on both create and update: `password` **>= 8 characters**, `pin` **4-8
digits**, `email` must be a valid address. The organisation's TIN field is spelled **`idTino`**.

#### Province / District / Sector are location ids

> 🔴 **These are location UUIDs, not names.** Sending `"Kigali"` is rejected with
> `Must be a valid UUID` on all three fields — so a free-text input could never submit
> successfully. They are ids from the imported location tree.

`LocationCascadeSelect` walks the hierarchy one level at a time:

| endpoint | returns |
| --- | --- |
| `GET /locations` | the **5 provinces** — every row has `parentId: null` |
| `GET /locations/parent/:id` | one level down |

Verified live: Kigali → 3 districts → Gasabo's 15 sectors → cells below that. The tree is
**five levels** deep (province, district, sector, cell, village); the client form uses the
first three.

Each level is fetched **only once its parent is chosen**, so opening the form does not pull
the 17k-row tree — and choosing a level **clears everything below it**, so a district can
never survive its province being switched. Provinces and their children are cached with
`staleTime: Infinity`, since administrative boundaries do not change mid-session.

> ⚠️ **An unknown parent returns `200` with an empty array**, not a `404`, so a stale id
> degrades to "nothing below this level" rather than an error.

### Discounts

A fixed rate for one client, or rates that change with volume.

| Endpoint                       | Notes                                    |
| ------------------------------ | ---------------------------------------- |
| `GET /discounts`               | Paginated envelope.                      |
| `POST /discounts`              | JSON — a **discriminated union**.        |
| `PUT /discounts/:id`           | Full record.                             |
| `PATCH /discounts/:id/status`  | Bodyless toggle.                         |
| `DELETE /discounts/:id`        | Hard delete.                             |

> 🔴 **`type` is the discriminator for the whole body**, not just a field:
>
> | type | targets | carries |
> | --- | --- | --- |
> | `fixed` | one **client** — `clientId` **required** | a single `value` |
> | `ranging` | volume tiers, **no client** | `rangingDiscounts[]` |
>
> A `ranging` body **rejects `clientId` outright** — `Unrecognized key: "clientId"` — so it is
> not merely optional. The form builds the two branches separately rather than sending one
> object with unused keys.

Field rules, all confirmed live:

- `value` must be **> 0**, at most **11 integer digits and 1 decimal place**
- `status` is **lowercase** `active | inactive` — `ACTIVE` is rejected
- `validTo` must be **later than** `validFrom`
- `siteId` is optional (blank = all sites), but **every tier needs one**

> ⚠️ **Tiers for the same site must not overlap** — `Ranges for the same site must not
> overlap` — and each needs `to` **greater than** `from`. Both are checked client-side too, so
> a bad tier is caught before sending and reported on the row that caused it.

A ranging discount's top-level `value` is always `0` — the tiers carry the real figures — so
the list shows the **tier range** (`2–3.5 over 2 tiers`) rather than a misleading zero. Only
ranging rows expand, so the chevron and the behaviour agree.

The list also flags a discount that is **active but outside its dates**, which is the
difference between switched on and actually applying.

### Client wallets

One wallet per client organisation, under **Client Management → Wallets** in the live tree.

| Endpoint                              | Notes                                       |
| ------------------------------------- | ------------------------------------------- |
| `GET /client-wallets`                 | List.                                       |
| `POST /client-wallets`                | JSON — the whole body is `{ clientId }`.    |
| `PATCH /client-wallets/:id/status`    | Bodyless toggle.                            |
| *(no DELETE)*                         | `ROUTE_NOT_FOUND`.                          |

> ✅ Every route here returned `403 FORBIDDEN` during development, even for a superAdmin
> holding all six wallet permissions. **Fixed server-side and re-verified** — the list now
> returns real wallets.

> ⚠️ **Wallet ids are CUIDs**, and **the balance field is `amount`** (a string), not
> `balance`. Both were guessed wrong while the endpoint 403'd; the types now match the live
> response, and the typecheck caught every place the guess had leaked into the UI.

#### Movements

| Endpoint                                | Notes                          |
| --------------------------------------- | ------------------------------ |
| `GET /client-wallets/:id/movements`     | The ledger, paginated.         |
| `POST /client-wallets/:id/movements`    | Records one movement.          |

```jsonc
{ "type": "DEPOSIT", "amount": "1250.50", "accountId": "<company account CUID>", "referenceId": "DEP-001" }
```

> 🔴 **`accountId` and `referenceId` are required only for `DEPOSIT`** — *"Company account is
> required for a deposit"* / *"Reference is required for a deposit"*. The other six types need
> neither, so the form **hides both fields** for them rather than showing optional inputs, and
> omits the keys entirely from the body.

**Seven types**, from the API's own rejection: `DEPOSIT`, `PAYMENT`, `REFUND`, `LOAN`,
`WITHDRAWAL`, `TRANSFER`, `ADJUSTMENT`. Three move money out (`PAYMENT`, `WITHDRAWAL`,
`TRANSFER`); the ledger signs them accordingly rather than showing bare figures.

> ⚠️ **`amount` is a string**, must be **> 0**, and takes **at most 2 decimal places** — a
> JSON number is rejected outright with *"Amount must be a positive monetary value"*. All
> three rules are enforced client-side so a bad figure never reaches the API.

> ⚠️ **`accountId` is a company account CUID** — the deposit picker reads
> `GET /company-accounts`, gated on `company.account.read`.

Each wallet row **expands to its ledger**, fetched lazily so no movements load until a wallet
is opened. The form shows the resulting balance (`0 + 1,250.50 = 1,250.50`) before submitting.

**The ledger filters by date** — `startDate` / `endDate`, widened to whole calendar days as
everywhere else, with blank values stripped rather than sent. The two inputs bound each other
(`From` cannot exceed `To`) and are id-scoped per wallet, so two expanded rows do not collide.

> 🔴 **`GET /client-wallets/:id/movements` currently returns `500 INTERNAL_ERROR`** —
> unconditionally: with or without the date parameters, and regardless of pagination. **The
> filters are not the cause.**
>
> It returned `200` earlier in development while the ledger was empty, and began failing once
> the first movement existed — so it is the *response* that breaks, not the request.
> Everything around it is sound: an unknown wallet id still gives a clean
> `404 Client wallet not found`, and both `GET /client-wallets` and the wallet detail return
> `200` on the same session. This looks like serialising a movement row.
>
> The UI reports it as *"The ledger could not be loaded — the server errors on this
> request"* rather than a raw error, so it does not read as a bad date range.

> ⚠️ **Two permission families exist for one module** — `client.wallets.*` and `wallets.*`.
> The dotted one matches the module code, so that is what `PERMISSION_MODULES.clientWallets`
> uses.

**Wallets are opened from the Clients page**, not from here — the wallet belongs to an
organisation, and only its `clientAdmin` owns one:

```
Pascal NP    ITEC   [Admin]   [Wallet]   ← offered
Marie K      ITEC   [User]              ← not: only the admin owns the wallet
```

Once a wallet exists the button becomes a badge, so a second one cannot be opened for the
same organisation. The response shape is unconfirmed (the endpoint 403s), so the hook accepts
**either** a flat array or a paginated envelope, and every field but `id` is optional.

> ⚠️ **`DISCOUNTS`, `STOCK_MANAGEMENT` and `PSS_STOCK_MANAGEMENT` are live sidebar nodes with
> no page yet.** They are registered for their **icon only** — a node without one renders as a
> blank spacer, which reads as a fault rather than as simply unbuilt. Give each a `path` when
> its screen exists.

### Company accounts

The company's bank accounts, by reference code and name.

| Endpoint                              | Notes                                        |
| ------------------------------------- | -------------------------------------------- |
| `GET /company-accounts`               | ⚠️ **Paginated envelope**, not a flat array. |
| `GET /company-accounts/:id`           | Detail.                                      |
| `POST /company-accounts`              | JSON. Both fields required.                  |
| `PUT /company-accounts/:id`           | Full record — not a patch.                   |
| `PATCH /company-accounts/:id/status`  | 🔴 **`PATCH`**, not `PUT`. Bodyless toggle.  |
| *(no DELETE)*                         | 🔴 The route does not exist.                 |

```jsonc
{ "code": "BK020303030030", "name": "BK Account" }
```

> 🔴 **Ids are CUIDs, not UUIDs.** A UUID is rejected with `400` and
> `Company account id must be a valid CUID` — *before* the record lookup — so a malformed id
> never reaches it. A well-formed CUID that does not exist gives the expected `404`. This is
> the first resource here to use CUIDs for its own ids rather than UUIDs.

> 🔴 **The status route is `PATCH`.** `PUT .../:id/status` returns `ROUTE_NOT_FOUND`. That
> makes **two** endpoints now breaking the `PUT`-for-status convention — this and stockout
> authorizers — so it is worth checking rather than assuming.

> 🔴 **There is no delete**, even for a well-formed CUID. Deactivating is the only way to
> retire an account, so the page offers no delete control and the service ships no `remove`
> method rather than one that always 404s.

> ⚠️ **Both fields are required, and must be non-empty strings.** An empty string fails with
> `Too small: expected string to have >=1 characters`, and a numeric `code` with
> `expected string, received number`. The form `.trim()`s so whitespace alone cannot pass a
> check the API would then reject.

`COMPANY_ACCOUNT` sits under **System Settings** in the live tree, beside Users and Roles.

> ⚠️ **`CLIENTS` is also in the live sidebar with no page built yet** — it renders greyed-out
> until one exists.

### Authorizers

Which **roles** may sign off a loading order, and in what order. Authority belongs to the
role, not to a person, so anyone holding it can approve.

| Endpoint                                          | Notes                                  |
| ------------------------------------------------- | -------------------------------------- |
| `GET /stock-out-orders/authorizers`               | The list — **the bare path**.          |
| `GET /stock-out-orders/authorizers/:id`           | Detail. `200` + `null` if unknown.     |
| `POST /stock-out-orders/authorizers`              | JSON.                                  |
| `PUT /stock-out-orders/authorizers/:id`           | Full record.                           |
| `PATCH /stock-out-orders/authorizers/:id/status`  | 🔴 **`PATCH`**, not `PUT`. Bodyless toggle. |
| `DELETE /stock-out-orders/authorizers/:id`        | Hard delete.                           |

```jsonc
{ "type": "LOADING_ORDER", "levels": 1, "roleId": "uuid" }
```

> 🔴 **The status route is the one `PATCH` in this API.** `PUT .../:id/status` returns
> `ROUTE_NOT_FOUND`; `PATCH` reaches the handler. Every other status endpoint here is a `PUT`,
> so this is easy to get wrong. The body is ignored — `{}`, `{status:'active'}` and no body
> behave identically — so it **flips** rather than sets, like the rest.

> ⚠️ **The list is the bare path**, not `/authorizers/{id}` as first documented. `/{id}` is
> the detail, and returns `200` with `data: null` for an unknown id rather than a `404`.

> ⚠️ **`type` accepts only `LOADING_ORDER`**, exactly as spelled — `loading_order` and
> `STOCK_OUT` are both rejected. It ships as a one-value enum with the control locked, so a
> second type is one line in `AUTHORIZER_TYPES`.

> ⚠️ **Only `roleId` is strictly required** — `{ roleId }` alone is accepted, so `type` and
> `levels` have server defaults. Both are sent anyway: relying on an undocumented default
> would break silently if it changed. `levels` must be a whole number **> 0**, and an unknown
> `roleId` gives **`404 Role not found`**, not a validation error — the form maps that onto
> the role field rather than showing a bare toast.

> ⚠️ **`GET /roles` returns `{ items: [...] }`**, not a flat array. `useRoles()` already
> unwraps it; anything reading `data` directly sees no roles.

Rows are ordered by **level**, the sequence approvals actually happen in.

### Clearance agents

Agents who clear stock through customs, and the fee each charges.

| Endpoint                            | Notes                                     |
| ----------------------------------- | ----------------------------------------- |
| `GET /clearing-agents`              | Flat array, not a paginated envelope.     |
| `POST /clearing-agents`             | JSON. Both fields required.               |
| `PUT /clearing-agents/:id`          | Both fields required — not a patch.       |
| `PUT /clearing-agents/status/:id`   | Bodyless toggle, `active` ↔ `inactive`.   |
| `DELETE /clearing-agents/:id`       | **Hard delete** — confirmed working.      |

```jsonc
{ "names": "Pascal", "fees": 2000 }
```

> 🔴 **The route and the module disagree on spelling.** The endpoint is
> `/clearing-agents` (**-ing**); the module code is `CLEARANCE_AGENT` and its permissions are
> `clearance.agent.*`. Both are live and neither is a typo to fix on one side only — the
> service uses one spelling, `PERMISSION_MODULES.clearanceAgents` the other.

> ⚠️ **The status toggle is the one endpoint here that *requires* a body.** Every other
> status route in this API rejects an empty body when the header claims JSON, so they strip
> `Content-Type`; this one returns `415` without it and `400 FST_ERR_CTP_EMPTY_JSON_BODY`
> with the header but no body. It needs `application/json` **and** an explicit `{}`. It still
> flips rather than sets.

> ⚠️ **`fees` is sent as a number but returned as a string** (`"2000"`). The API coerces a
> numeric string on the way in but rejects `NaN`, so the form parses before sending and every
> reader parses on the way out. `0` is accepted; negative is rejected with
> `Too small: expected number to be >=0`.

> ⚠️ **Both fields are required on update too.** A partial body is rejected with
> `VALIDATION_ERROR`, so the edit path sends the whole record.

> ⚠️ **`GET /clearing-agents/:id` returns `200` with `data: null` for an unknown id**, not a
> `404` — so a missing record is indistinguishable from an empty one by status alone. The
> page never needs this (the list row carries every field), but the service documents it.

Unlike most reference tables here, this one **does** have a delete endpoint, so the page
offers both deactivate and delete. Delete is gated on `clearance.agent.delete` and confirmed
through `ConfirmDialog`, with the dialog steering toward deactivation for anything that may
be used again.

> A central-stock clearance carries an `agent` field — currently `null` on every record. That
> is the eventual link between the two, which is why writing an agent invalidates
> `centralStock` in the dependency map. Nothing references an agent yet, so this ships as a
> standalone reference table.

### Supplier types

| Endpoint                                | Notes                                       |
| --------------------------------------- | ------------------------------------------- |
| `GET /suppliers/supplier-type`          | **Flat array** of `{ id, type, status }`.    |
| `GET /suppliers/supplier-type/:id`      | Same three fields — no timestamps.           |
| `POST /suppliers/supplier-type`         | Body `{ type }`.                             |
| `PUT /suppliers/supplier-type/:id`      | Body `{ type }`.                             |
| `PUT /suppliers/supplier-type/status/:id` | Toggles `active` ↔ `inactive`. No body.    |

Existing values are uppercase (`FOREIGN`, `LOCAL`), so the form normalises input to
uppercase and guards duplicates case-insensitively — otherwise `Foreign` and `FOREIGN`
could coexist. There is no delete endpoint, so editing is the only correction path.

> **The write endpoints are built but not exercised.** Only the two `GET`s were called
> during development; create, update, and status were left untested to avoid writing to
> the shared dev database. The status endpoint follows the same contract as the users,
> units, and items toggles — bodyless `PUT`, flips rather than sets, and needs
> `Content-Type` stripped — but that is inferred from the pattern, not verified here.

## Three patterns worth following

The first two were found as real bugs on the Orders page; the third came from an audit of
every mutation in the app.

### After a write, refresh everything the write changed — not just its own list

All 51 mutations invalidated *something*, but several refreshed only their own feature while
leaving another page showing a figure the write had just changed. The cases were real:

| doing this… | left this stale | because |
| --- | --- | --- |
| creating or approving **cargo** | the **orders** list | orders carry `stockCargos`, `remainingStock`, `cargos[]`, all derived from cargo |
| editing an **order** | the **cargo** list | cargo rows embed their `order`, including its quantity |
| creating a **T1** | a nomination's **timeline** | a T1 advances it to `t1Pending` / `t1Confirmed` |
| creating **central stock** | a nomination's **timeline** | it advances the nomination to `stockReceived` |
| editing a **supplier** or **item** | the **orders** list | orders nest `supplier` and `item` |

The cargo one was the worst: the cargo form validates against the order's `remainingStock`,
so after approving a shipment the very next cargo would be checked against a stale remainder.

**[`src/api/query-keys.ts`](src/api/query-keys.ts) now holds every query key and a map of
which domains derive from which.** Mutations call:

```ts
onSuccess: () => invalidate(queryClient, 'cargo')
// flushes cargo + orders + stock, per the map
```

rather than listing keys inline. Each entry in the map is justified by a field observed in a
live API response, and the table above is reproduced in the file's doc comment.

> ⚠️ **Some query keys are prefixes of others**, and TanStack Query matches by prefix —
> `['orders']` also flushes `['orders','order-plan']`, `['items']` also flushes
> `['items','units']`, and `['suppliers']` also flushes `['suppliers','supplier-type']`. That
> is harmless, but it is why those pairs are not listed as explicit dependants. `pfi` and
> `currencies` were deliberately given unrelated keys to avoid exactly this.

> ⚠️ The `t1Validation` → `nominations` and `centralStock` → `nominations` links are
> **inferred from the timeline's stage names** (`t1Pending`, `t1Confirmed`, `stockReceived`),
> not observed — confirming them would mean creating records. A redundant refetch is cheap
> and a stale timeline is not, so they are wired.

Per-record keys the map cannot know — a detail query, a nomination's timeline — are passed
as the third argument:

```ts
invalidate(queryClient, 'nominations', [
  [...nominationsQueryKey, id],
  [...nominationsQueryKey, id, 'timeline'],
])
```

### A Select's current value must always have a mounted option

Radix renders a `Select`'s label by matching its `value` against a mounted `SelectItem`.
If the matching option is absent for even one render, the trigger silently falls back to
its placeholder and the field looks empty — with no error.

Dialogs that fetch a record to seed themselves hit this: the form sets `supplierId` from
the fetched order, but the option list is filtered on that same fetched record, so there
is a window where the value exists and the option does not. Filters therefore include
**the currently selected id** as well as the fetched record's:

```ts
const options = suppliers.filter(
  (s) => s.status === 'active' || s.id === order?.supplierId || s.id === selectedId,
)
```

This also keeps an inactive supplier visible on the order that already uses it, without
offering it for new ones.

### Gate a shared query on *its own* module's permission

`useSuppliers`, `useUnits`, and `useOrderPlans` are called from several pages but share
one cache key. Passing the **calling page's** permission to `enabled` means a user who can
read orders but not suppliers leaves `['suppliers']` cached as `[]` — and the Suppliers
page then renders empty too.

Each shared query is gated on the permission of the feature that owns it:

```ts
const canReadSuppliers = permissions.forModule(PERMISSION_MODULES.suppliers).canRead
const { suppliers } = useSuppliers({ enabled: canReadSuppliers })
```

## Permissions

Every module generates **five** permission codes — `read`, `create`, `edit`, `delete`,
`manage` — named after the module: `suppliers.type.read`, `units.edit`, and so on. The
login and refresh responses carry exactly the codes the signed-in user's role holds.

**`<module>.manage` grants every action on that module.** This is not cosmetic: the
Administrator role holds `roles.manage` and *not* `roles.read`, so a naive exact-string
check would deny it access to the Roles page.

`hooks/use-permissions.ts` is the single place that decides this:

```ts
const { canRead, canCreate, canEdit, canDelete } =
  usePermissions().forModule(PERMISSION_MODULES.supplierTypes)
```

Each page then gates its own UI:

| Missing permission | Effect                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `read`             | The table is replaced by a `NoAccess` panel, **and the list request is never sent** (`enabled: canRead`). |
| `create`           | The "New …" button is not rendered.                              |
| `edit`             | The edit action column is dropped, and the status switch becomes a read-only badge. |
| `delete`           | The delete action is not rendered (Roles and Modules only).      |

Status toggles count as `edit`, since they change the record.

> **Module codes are matched exactly, not by prefix.** `suppliers.manage` does **not**
> grant anything on `suppliers.type`, even though one string prefixes the other — both
> directions are covered by tests.

**This is UI gating, not enforcement.** The API is the authority; hiding a button only
stops the honest path. `PERMISSION_MODULES` in `use-permissions.ts` maps each feature to
its module code — add an entry there when adding a feature.

### 🔴 Most read endpoints reject `.read` and require `.manage`

A role holding only the six `*.read` codes gets **403 on five of seven list endpoints**.
Verified against the live API with the `Developer` role
(`modules.read`, `roles.read`, `suppliers.read`, `suppliers.type.read`, `units.read`,
`users.read`):

| Endpoint                     | Role holds            | Result   |
| ---------------------------- | --------------------- | -------- |
| `GET /roles`                 | `roles.read`          | **200** ✅ |
| `GET /modules/list`          | `modules.read`        | **200** ✅ |
| `GET /users`                 | `users.read`          | **403** ❌ |
| `GET /suppliers`             | `suppliers.read`      | **403** ❌ |
| `GET /suppliers/supplier-type` | `suppliers.type.read` | **403** ❌ |
| `GET /items/units`           | `units.read`          | **403** ❌ |
| `GET /items`                 | *(none — expected)*   | **403** ✅ |

The same requests return **200** for the Administrator, which holds both `.read` **and**
`.manage` on those modules — so it cannot distinguish them. The decisive evidence is
`/roles`: the admin holds only `roles.manage` (no `roles.read`), yet the Developer with
only `roles.read` gets 200. So `/roles` honours `.read` and the others do not.

**This is a backend bug.** A view-only role is currently unusable on Users, Suppliers,
Supplier types, and Units. The fix is to gate those routes on `<module>.read` (with
`.manage` implying it), matching `/roles`.

The frontend behaves correctly throughout — it shows the pages, hides the create/edit
controls, and issues the read request, which the API then refuses. That 403 renders as a
distinct "the server refused access" panel naming the permission the role holds, so it
does not read as a missing grant or a frontend fault.

### Stock

**Stock is view-only in this console.** Records are produced by the cargo flow, so the
page lists them and moves them between statuses — there is no create or edit. `POST
/stock` and `PUT /stock/:id` exist on the API and are deliberately not surfaced.

| Endpoint                        | Used | Notes                                     |
| ------------------------------- | ---- | ----------------------------------------- |
| `GET /stock`                    | yes  | Nests `cargo` and `deport`; **no flat ids**. |
| `GET /stock/:id`                | yes  | —                                          |
| `PUT /stock/status/:id/:status` | yes  | **Sets** the status; target in the path.   |
| `POST /stock`                   | no   | Not surfaced — stock comes from cargo.     |
| `PUT /stock/:id`                | no   | Not surfaced.                              |

Status is a **set with four values** — `awaiting`, `received`, `returned`, `cancelled` —
chosen from a dropdown rather than toggled, with *returned* and *cancelled* confirmed
first. It is the only write the page makes, so it is gated on `stock.edit`; without it
the status renders as a plain badge.

> 🔴 **`GET /stock` returns one entry per *item*, not a flat list of stock rows.** Each
> group is `{ item, summary, stocks[] }`. The table renders **items** as rows, with their
> individual receipts expanding beneath.

The shape has changed twice. As it now stands:

| | Now | Previously |
| --- | --- | --- |
| Group totals | `summary` object | bare `totalQuantity` |
| Item unit | **resolved `baseUnit`** | bare `baseUnitId` |
| Item parent | *absent* | `parentId` |
| Stock's depot | **`depot`** | `deport` |
| Stock quantity | **number** | string |
| Item on a stock row | *absent* — on the group | present |

> ⚠️ **`depot` on a stock row, `deport` everywhere else.** The resource, its endpoint and
> the `Deport` type all use "deport"; only this nesting differs.

> ⚠️ **Stock's `quantity` is a number, but its nested `cargo.quantity` is still a string** —
> on the same record. Both are parsed rather than assumed.

> 🔴 **`summary.totalQuantity` includes cancelled and returned stock**, so it is a gross
> received figure, not stock on hand. **`quantitiesByStatus`** gives the split — but it
> **only lists statuses actually present**, so a group with no cancelled stock has no
> `cancelled` key. Read it with a default rather than assuming all four exist.
>
> The page shows an **On hand** column summed from `awaiting` + `received`, a **By status**
> column rendering the split as badges, and **Total received** carrying the API's own figure
> with the difference spelled out. Showing only one would either overstate the holding or
> silently disagree with the backend.

```
> PMS   in Litrer (LT)
      On hand: 400 LT   By status: Received 400   Total: 400   Lines: 2
        Vessel 1   Dar · Tanzania   BL 123   200 LT   2026-08-20  [received]
        Vessel 2   Dar · Tanzania   BL 345   200 LT   2026-08-20  [received]
```

**`GET /stock` accepts four filters**: `startDate`, `endDate`, `status` and `deportId`.

> ⚠️ **The parameter is `deportId`, even though the response nests the depot as `depot`.**
> `depotId` is **silently ignored** rather than rejected, so that typo returns unfiltered
> results that look perfectly correct — the worst kind of wrong.

> ⚠️ **Every filter is validated when present, so an unset one must be omitted entirely.**
> `status=` and `deportId=` both return `400` rather than meaning "no filter", so the
> service strips blank values before sending.

> 🔴 **`endDate` is widened to `23:59:59.999`.** An `<input type="date">` yields a calendar
> day, and sending it as midnight excludes everything received later that same day —
> verified directly: `endDate=2026-08-20T00:00:00.000Z` returns **0 rows** where
> `…T23:59:59.999Z` returns **4**. Picking today as the end date would otherwise appear to
> show nothing.

The filter is part of the React Query key, so each combination caches separately, and
`placeholderData` keeps the previous rows on screen while a new one loads rather than
flashing empty. The depot picker is hidden entirely when `deports.read` is missing, since an
empty dropdown reads as broken.

The status dropdown lives in the expanded panel, since status belongs to an individual
receipt rather than to the item. Its trigger calls `stopPropagation`, or changing a status
would collapse the panel.

> **`useStockList` exposes both shapes** — `groups` for this page, and `stock` flattened for
> the nomination picker, which needs a single stock line rather than an item. **The group's
> `item` is copied onto each flattened row**, since a stock row no longer carries one and
> the picker could not otherwise name what it offers.

Because `baseUnit` now arrives resolved, both the stock page and the nomination picker
**dropped their `/items/units` lookup** entirely. The picker still reads the items tree, but
only to name the item's parent — the one thing the new item shape does not carry.

Each line still shows `of N in cargo` **only when the receipt differs from the shipment it
came from** — both quantities are nested, so no extra request is needed.

### Nozzles

The join point of the PSS chain, tying a **pump**, a **display** and a **cuve** together.
`NOZZLE` is another sibling module under PSS Operation Forecourt.

| Endpoint                  | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| `GET /nozzles`            | Nests **all three** relations; carries `status`.  |
| `GET /nozzles/:id`        | All three flat ids; no nesting.                   |
| `POST /nozzles`           | JSON. All five fields required.                   |
| `PUT /nozzles/:id`        | Same body. `PATCH` and `DELETE` both 404.         |
| `PUT /nozzles/status/:id` | **Toggles** the status. Bodyless.                 |

> **The pump is chosen first, because it determines the site.** All three relations belong
> to a site, so a nozzle joining equipment from *different* sites would be meaningless.
> Whether the API rejects that is **unverified** — confirming it would need a successful
> write — so the form prevents the question arising: the display picker filters to the
> chosen pump, and the cuve picker to that pump's site. Changing the pump **clears** a
> display or cuve that no longer matches, rather than leaving it silently mismatched.
>
> The existing record bears the constraint out: its display's `pumpId` matches the nested
> pump, and its cuve's `siteId` matches the pump's.

The cuve column shows the **item** it draws from — that is what the nozzle actually
dispenses. Naming the site needs the sites list, since the nested pump carries only a
`siteId`.

Status is the same **bodyless toggle**, rendered as a switch with deactivation confirmed.

### Cuves

Storage tanks at a site, each holding one item between a minimum and a maximum. `CUVE` is
another **sibling** module under PSS Operation Forecourt.

| Endpoint                | Notes                                          |
| ----------------------- | ---------------------------------------------- |
| `GET /cuves`            | Nests `item` **and** `site`; carries `status`.   |
| `GET /cuves/:id`        | Flat `itemId`/`siteId`; no nesting.             |
| `POST /cuves`           | JSON. **All six fields required.**              |
| `PUT /cuves/:id`        | Same body. `PATCH` and `DELETE` both 404.       |
| `PUT /cuves/status/:id` | **Toggles** the status. Bodyless.               |

> ⚠️ **`deadStock` is required, despite commonly being sent empty.** Omitting it fails
> validation. `""` and `null` *are* accepted and stored as `0`, but the form sends an
> explicit `0` when the field is blank rather than relying on that coercion — a contract
> that happens to work is not one to depend on.

The three levels are **coerced**: a number and a numeric string are both accepted, a
non-numeric string is not. They come back as **strings**.

> **Two client-side rules the API does not enforce.** Maximum must exceed minimum, and dead
> stock cannot exceed the maximum. The API accepts an inverted range silently, which would
> make the tank's configuration meaningless rather than merely wrong.

The nested item carries a bare `baseUnitId`, so the unit is resolved from `/items/units` —
the levels read `30 – 100,000 LT` rather than as bare numbers, and the row shows dead stock
only when it is above zero. The create form reuses the Items page's Class → Item → Category
picker.

Status is the same **bodyless toggle**, rendered as a switch with deactivation confirmed.

### Displays

Displays attached to a pump — the third level of PSS: **site → pump → display**. `DISPLAY`
is another **sibling** module under PSS Operation Forecourt, with its own five permissions.

| Endpoint                   | Notes                                             |
| -------------------------- | ------------------------------------------------- |
| `GET /displays`            | Nests `pump` **and** carries `status`.             |
| `GET /displays/:id`        | Flat `pumpId`; no nested pump.                     |
| `POST /displays`           | JSON. `name`, `code`, `pumpId` all required.       |
| `PUT /displays/:id`        | Same body. `PATCH` and `DELETE` both 404.          |
| `PUT /displays/status/:id` | **Toggles** the status. Bodyless, like sites/pumps. |

> **Better behaved than pumps:** the displays list **carries `status`**, so unlike the pumps
> table it needs no second source for it. It still omits the flat `pumpId`, so the edit form
> reads the detail.

The nested pump carries only a `siteId`, so naming the site takes the sites list — the row
shows `Pump F (KABUYE2)`, walking the full chain. The pump picker shows each pump's site
too, since **pump names repeat across sites** and the name alone would be ambiguous.

Status is the same **bodyless toggle**, rendered as a switch with deactivation confirmed.

> ✅ **Whole route surface mapped with a fake id, zero writes.** `PUT /displays/:id` and
> `PUT /displays/status/:id` returned `RESOURCE_NOT_FOUND`; `PATCH` and `DELETE` returned
> `ROUTE_NOT_FOUND`.

> ⚠️ **Whether `code` is unique is unverified.** It is not checked at validation time — a
> body carrying an existing code fails only on the *other* missing fields. Confirming it
> would need a successful write, so it was left untested.

### Pumps

Pumps installed at a site. `PUMP` is a **sibling of `PSS`**, not a child — it has its own
five permissions, which is why the sites page deliberately does not render the `pumps` it
nests.

| Endpoint                | Notes                                            |
| ----------------------- | ------------------------------------------------ |
| `GET /pumps`            | Nests the full `site`; **omits `status`**.        |
| `GET /pumps/:id`        | `siteId` and `status`; **no nested site**.        |
| `POST /pumps`           | JSON. `name` and `siteId` both required.          |
| `PUT /pumps/:id`        | Same body. `PATCH` and `DELETE` both 404.         |
| `PUT /pumps/status/:id` | **Toggles** the status. Bodyless, like sites.     |

> ⚠️ **The list and detail shapes are disjoint**, as with nominations and PFI: the list
> nests `site` but carries **no `status` and no `siteId`**; the detail has both but no
> nesting. So the edit form *must* read the detail — the list has no id to bind to.

> **The status comes from the sites list, not the pumps list.** `GET /pumps` omits it, but
> `GET /sites` nests each site's pumps **with** their status — and the page already loads
> sites for the picker, so the switch costs no extra request. The detail value is preferred
> when present; the nesting is the fallback.

Status is the same **bodyless toggle** as sites, so it renders as a switch rather than a
dropdown, with deactivation confirmed.

> ✅ **The fake-id rule worked.** Probing `PUT /pumps/status/<fake-uuid>` returned
> `RESOURCE_NOT_FOUND` — proving the route exists and rejected the id — while `PATCH` and
> `DELETE` returned `ROUTE_NOT_FOUND`, proving those routes are absent. **That distinction
> maps the whole surface without a single write**, and is exactly what should have been done
> on sites, where probing a real id flipped a live record instead.

### Stockout orders

> ⚠️ **`GET /stock-out-orders` returns an envelope, not an array.** It used to be a flat
> list; anything still expecting one silently renders zero rows.
>
> ```jsonc
> { "summary": { … }, "breakdowns": { "items": [], "sites": [] }, "orders": [ … ] }
> ```
>
> The page shows the API's own `summary` as tiles (orders, quantity, amount, average unit
> price) and both `breakdowns` as per-item and per-site totals — **read, not recomputed**, so
> they cannot disagree with the server once the table is filtered or paged. Verified: the
> visible rows sum exactly to `summary.totalQuantity` and `summary.totalAmount`.

> 🔴 **The item moved.** A row has no top-level `item` or `itemId` any more — it comes from
> **`centralStock.item`**, the receipt the order draws on. The old code resolved `itemId`
> against the items list and now finds nothing.

> 🔴 **`orderType` is `internal | b2b`** — *not* `external`, which the API rejects outright.
> **`siteId` is required only for `internal`** (`siteId is required when orderType is
> internal`); a `b2b` order goes to an outside buyer and needs none, so the site control is
> hidden entirely for it.

> 🔴 **The two types draw on different stock pools**, each with its own `422` ceiling:
>
> | `orderType` | drawn from | message |
> | --- | --- | --- |
> | `internal` | **cleared** stock | `Only <n> cleared stock is available` |
> | `b2b` | **uncleared** stock | `Only <n> uncleared stock is available` |
>
> Which fits the business — a B2B sale passes stock on before clearing, an internal transfer
> needs it cleared first. Verified live with 95 cleared and 100 uncleared: each type reported
> its own figure. The form states which pool applies under the type control, and the `422` is
> attached to the **quantity** field rather than shown as a bare toast.

**`GET /stock-out-orders` accepts `startDate` and `endDate`**, with the same day-widening as
elsewhere — but the page opens on a **default range** rather than unfiltered, and that is a
workaround, not a preference.

> 🔴 **The endpoint returns nothing unless `startDate` is set.** With two orders created
> `2026-08-26`:
>
> | request | orders | expected |
> | --- | --- | --- |
> | no filter | **0** | 2 |
> | `endDate` alone, even `2099` | **0** | 2 |
> | `startDate` alone | 2 | 2 ✅ |
> | both | 2 | 2 ✅ |
>
> A **complete range is correct at every boundary** — ending the day before creation gives 0,
> ending on or after it gives 2, starting after it gives 0 — so the filter logic itself works.
> What fails is the *absence* of `startDate`: the default behaves as though one were set in
> the future.
>
> The page therefore opens on **the last twelve months**, since opening unfiltered would show
> an empty table however many orders exist. The control offers **Reset** rather than Clear —
> clearing `startDate` would return nothing at all, so the default range *is* the meaningful
> "no filter".

> ⚠️ The **summary and breakdowns follow the filter** — they are computed over the filtered
> set, not the whole table. Verified: `summary.orderCount` and `summary.totalQuantity` match
> the rows returned for a given range.

#### Loading orders

`POST /stock-out-orders/loading-orders` assigns stockout orders to a vehicle for loading.

```jsonc
{ "driverVehicleId": "…", "orders": [ { "orderId": "…", "quantity": 40 } ] }
```

> ⚠️ **`quantity` is a number, not a string** — a string is rejected. It must be **> 0**, and
> `orders` needs **at least one** line.

> ⚠️ **`driverVehicleId` is the assignment id** (`driver.vehicles[].id`), not the vehicle's own
> id — the same field nominations uses.

> 🔴 **Two independent ceilings**, both `422` with a plain message rather than field details:
>
> | limit | message |
> | --- | --- |
> | per **order** | `Order <id> has 40 unassigned but 100 was requested` |
> | per **vehicle** | `Vehicle capacity is 5000; 0 is already assigned and 8000 was requested` |
>
> The vehicle ceiling **sums the whole array** *and* whatever is already on that vehicle, so
> two lines each within capacity can still be refused together. When a figure exceeds both, the
> **vehicle** check reports first.

> ⚠️ **The same order cannot appear twice** in one request — the API answers only
> `The request contains invalid data`, so the form catches it first and names the offending row.

> ⚠️ **The capacity is not on the nested driver vehicle.** `driver.vehicles[].vechile` carries
> only id, plate, model and status — `tankCapacity` lives on `/vehicles`, so the dialog joins
> the two to show the load against capacity before sending. Gated on `vehicles.read`.

Loading orders are **their own module** (`loading.orders.*`) despite the nested route, like
authorizers, and have **their own page** at `/loading-orders` — `LOADING_ORDERS` sits under
**Stock Management → PSS Stock**, beside Central Stock. The button on the Stockout orders page
is kept as a shortcut, so an order can be loaded from the list you are already looking at.

**`GET /stock-out-orders/loading-orders`** lists them.

> ⚠️ **Grouped: one row per request**, carrying `loadedOrders[]`. An earlier shape returned
> one row *per order*, with a top-level `orderId` and `quantity` — both are gone, and
> **`totalQuantity`** (the sum across the lines) replaces the old `quantity`. Verified live:
> `15 + 20 = 35`.

> ⚠️ **`dVehicle.vechile` now carries `tankCapacity`.** The copy nested under `/drivers` still
> does not, which is why the create dialog joins `/vehicles` — but the loading-orders list
> needs no join. `dVehicle.status` becomes **`occupied`** once a load is assigned.

> ⚠️ **The driver block is `dVehicle`**, and the vehicle inside it is **`vechile`** — two
> different misspellings in one path. `quantity` arrives as a **string**.

> ⚠️ **Authorisation is tracked separately from `status`.** A row carries `authoriserCount`
> (how many signatures the chain needs — see [Authorizers](#authorizers)), an
> `authorizationStatus`, and an `authorizers[]` array that is **empty until someone signs**.
> The page shows *"0 of 3 signed"* and *"Awaiting 3 authorisers"* rather than an empty panel,
> since waiting is the normal state, not missing data.

Each row expands to its provenance: the **clearance** it was drawn against (agent, fees,
amount, both documents) and the **central stock** behind it (depot, T1, receipt size), plus
who raised it and whether it has been approved.

> ⚠️ `centralStock.deport` is spelled with an **r** here, while central stock's own endpoint
> spells the same field `depot`. Both are live.


Stock sold out from a site at an agreed unit price. Module code `STOCKOUT_ORDERS`, with
**dotted** permissions (`stockout.orders.*`).

| Endpoint                        | Notes                                     |
| ------------------------------- | ----------------------------------------- |
| `GET /stock-out-orders`         | Currently empty.                           |
| `GET /stock-out-orders/:id`     | ⚠️ Returns `data: null`, not a 404.        |
| `POST /stock-out-orders`        | JSON. Three required fields.               |
| `PUT /stock-out-orders/status/:id/:status` | 🔴 **Does not exist yet.**      |

**Required: `itemId`, `quantity`, `unitPrice`.**

> ⚠️ **`siteId` is optional**, despite appearing in the documented example — it is absent
> from the API's own rejection of an empty body. It *is* validated as a UUID when present,
> so the form omits it rather than sending `""`, and offers an explicit **"No site"** choice
> rather than leaving the user to guess that blank is allowed.

> ✅ **The status endpoint exists now**, and the page is no longer read-only:
> **`PUT /stock-out-orders/:id/status/:status`**.
>
> ⚠️ **The id comes *before* `status`.** The service had been calling
> `/status/:id/:status` — which is `ROUTE_NOT_FOUND` — so every status change failed silently
> and the page shipped as a badge. Exactly as the cargo route did, it reappeared with the
> segments in a different order than first documented.
>
> Only `PUT` is routed; `PATCH`, `POST` and `GET` all `404`. The request is **bodyless**, so
> `Content-Type` is stripped — with the header set and no body, Fastify rejects it as
> `FST_ERR_CTP_EMPTY_JSON_BODY`.
>
> **Four states**, lowercase: `pending | approved | rejected | cancelled` — `APPROVED` is
> rejected. Unlike most status endpoints here this one **sets** rather than toggles, since a
> flip between four states would be ambiguous, so the page offers a **Select** like cargo's
> rather than a switch. Approving, rejecting and cancelling are **confirmed** (approve names
> the quantity being released); only returning to `pending` applies straight away.

> ⚠️ **`GET /stock-out-orders/:id` returns `{ success: true, data: null }` for an unknown
> id** rather than a `404`, so a caller must check the payload — the request will not throw.

> **The site picker is scoped to the signed-in user.** A **`superAdmin`** may choose any
> site, or none; anyone else sees only their own assignments.
>
> | | Sees | "No site" | Behaviour |
> | --- | --- | --- | --- |
> | `superAdmin` | every site | offered | free choice |
> | one assignment | that site | hidden | **preselected and locked** |
> | several | those sites | hidden | choose among them |
> | none | — | — | "You are not assigned to any site" |
>
> "No site" is withheld from a scoped user deliberately: filing an order against *no* site
> would sidestep the scoping entirely. With exactly one assignment the control is disabled
> rather than left as a decision that has already been made.

> ⚠️ **This is a convenience, not a security boundary.** The API decides what a request may
> do; narrowing the picker only stops someone choosing a site they cannot use.

The session carries what this needs — `AuthUser.position` and a **`sites` array of
assignments, each nesting a full site record** — so a scoped user's picker needs no request
at all and works without `pss.read`. A `superAdmin`'s `sites` is **empty**, which reads
correctly: they are not scoped to any, which is why they may pick freely. `useSiteScope`
holds this logic, since other pages will need the same rule.

The form shows **quantity × unit price** as a running total but **does not send it**: the API
takes a unit price and does its own arithmetic, so submitting a total would risk the two
disagreeing.

> ⚠️ **The response shape is unconfirmed** — the list is empty. The table reads a nested
> `item`/`site` **if present** and otherwise resolves bare ids against the items and sites
> lists, and derives the total rather than trusting a `totalPrice` that may not be returned.

### PSS — sites

Sites operating under PSS. The backend nests the module three deep:

```
PSS Operation Forecourt, Service Bay Shop, car wash
  └─ PSS Operation Forecourt
       ├─ PSS    -> /sites   (this page)
       └─ PUMP               (separate module, not built)
```

| Endpoint          | Notes                                          |
| ----------------- | ---------------------------------------------- |
| `GET /sites`      | Nests a `pumps` array the detail omits.         |
| `GET /sites/:id`  | Same fields minus `pumps`.                      |
| `POST /sites`     | JSON. **Only `name` is required.**              |
| `PUT /sites/:id`  | Same body. `PATCH` and `DELETE` both 404.       |
| `PUT /sites/status/:id` | **Toggles** the status. Bodyless.         |

**Only `name` is required** — `phone`, `email` and `address` are all optional and come back
`null` when unset, so the form omits a blank field entirely rather than sending `""`.
**`email` is format-validated** by the API, so the form validates it client-side rather
than waiting for the round trip; blank still passes.

> ⚠️ **`pumps` is nested on the list but deliberately not surfaced.** `PUMP` is a **sibling
> module with its own five permissions**, so showing pumps here would render data the
> viewer may not be entitled to. It is typed on `Site` and left for the PUMP feature.

> 🔴 **The status endpoint *toggles*; it does not set.** `PUT /sites/status/:id` carries no
> target state and no body, so the request itself is the change and calling it twice returns
> the site to where it started. The UI is therefore a **switch**, not the status dropdown
> used where a state can be chosen — offering "set to active" would imply a guarantee the
> endpoint cannot make. Bodyless, so `Content-Type` is stripped or Fastify rejects the empty
> body with `FST_ERR_CTP_EMPTY_JSON_BODY`.
>
> Deactivating is confirmed first, since it takes a site out of use; reactivating applies
> straight away.
>
> This route was found the hard way: probing for it flipped a real site from active to
> inactive, and the restoring call was blocked. **Rule going forward: probe an unknown route
> with a fake id**, never a real one — a fake id proves the route exists just as clearly,
> via a `404`/not-found, without touching data.

### Central stock

Stock held centrally, received against a T1 validation.

| Endpoint                              | Notes                                            |
| ------------------------------------- | ------------------------------------------------ |
| `GET /central-stock`                  | The **only** read — there is no detail endpoint. |
| `POST /central-stock`                 | **`multipart/form-data`**. Four required fields. |
| `POST /central-stock/reconciliation`  | JSON. 🔴 **Not deployed yet** — see below.       |

#### Clearance

Clears an item's stock through customs — the **Clear** button on each item row.

```jsonc
// multipart/form-data, NOT JSON
{ "itemId": "…", "quantity": 5000, "fees": 100, "amount": 2500,
  "agentId": "…", "supportingDocUrl": <file>, "dmsDocUrl": <file> }
```

> ⚠️ **It is `multipart/form-data`, and both document fields take real file uploads** —
> despite the documented body naming them `…Url` and showing paths. Sending JSON returns
> `406 FST_INVALID_MULTIPART_CONTENT_TYPE`. Same pattern as cargo, T1 validation and the
> central-stock create.

**Only `itemId` and `quantity` are required.** `fees`, `amount`, `agentId` and both documents
are optional — but each is validated when present, so blanks are **omitted entirely** rather
than sent empty. A bad `agentId` returns `404 Clearing agent not found`.

> 🔴 **Clearance is raised per *item*, not per receipt.** The API pools the item's uncleared
> stock and refuses anything larger with `422` and the message
> `Only <n> uncleared stock is available`. The dialog therefore takes the whole
> `CentralStockGroup`, bounds the input by `summary.unclearedQuantity`, and blocks submit
> before sending. The `422` arrives as a plain message with no field details, so it is
> attached to the **quantity** field — the thing it is actually about.

`quantity` must be **> 0**; `fees` and `amount` must be **>= 0**.

The button is hidden once an item has nothing left to clear, rather than opening a form the
API must refuse. It is gated on `central.stock.edit`; the agent picker is separately gated on
`clearance.agent.read`, so a user without it still gets the rest of the form.

> ⚠️ **`GET /central-stock/clearance` does not exist** — there is no read endpoint. Clearances
> are only visible nested inside each receipt in the `/central-stock` response.

> ⚠️ **The summary shape changed when reconciliation and clearance shipped.**
> `reconciledQuantity` split into `reconciledInQuantity` / `reconciledOutQuantity`, and
> `clearedQuantity` / `unclearedQuantity` are new. The Movement column was reading the retired
> field and silently showed nothing; it now shows both directions separately, since a
> reconciliation can add or remove and netting them would hide one. The old field is kept
> optional in the type so a stale server response still parses.

> ⚠️ **The response shape changed again once a clearance existed.** Four structural moves,
> all confirmed live:
>
> | change | detail |
> | --- | --- |
> | `transactions[]` **moved up** | from inside each clearance to the **stock row** — one ledger per receipt |
> | clearance figures **per receipt** | `clearedQuantity` / `unclearedQuantity` are now on each stock row, not just the summary |
> | `remainingQuantity` **removed** | from a clearance — the receipt's `unclearedQuantity` replaces it |
> | `agent` is the full record | `{ id, names, fees, status }`, not `{ id, name }` — note **`names`** |
>
> The expanded row now shows **Clearances** and **Movements** as separate sections. Movements
> are signed by direction (`+250 received`, `−2 reconciled out`) rather than netted, and the
> `reconcilliation*` misspelling is absorbed by `TRANSACTION_LABELS` rather than shown.
>
> Verified: the ledger reconciles with the receipt — `received` sums to `receivedQuantity`,
> each `reconcilliation*` to its own figure, and `cleared + uncleared = remaining`.

#### Fees auto-fill; amount does not

Selecting a clearing agent **fills in their fee**. Confirmed live: the existing clearance has
`fees: 1200` against an agent whose own fee is `1200` — the agent's fee *is* the clearance
fee. It stays editable (a one-off negotiation should be possible), and a `useRef` guard means
auto-fill only replaces a blank field or one still holding what it last put there — never a
figure typed by hand.

> 🔴 **`amount` is deliberately not calculated.** The live clearance has quantity `150`,
> fees `1,200` and amount `50,000` — which is neither `quantity × fees` (180,000) nor any
> clean multiple of either. There is no formula, so computing one would put a wrong number in
> front of the user. The field is labelled *"entered, not calculated"*.

> ⚠️ **`clearanceQuantitiesByStatus` is `{}` until a clearance exists**, so the Clearance
> column falls back to `summary.unclearedQuantity` — a dash there would read as "nothing to
> clear" when the opposite is true.

#### Reconciliation

Adjusts one receipt up or down to match what is physically held.

```jsonc
{
  "centralStockId": "c0992855-…",
  "quantity": "30",                       // a STRING here; the create takes a number
  "reconciliationType": "reconcilliationIn" | "reconcilliationOut",
  "state": "cleared" | "uncleared"
}
```

> ⚠️ **Note the doubled `l` in the enum values: `reconcilliationIn` / `reconcilliationOut`.**
> The field name and every surrounding figure use the correct single-`l` spelling
> (`reconciliationType`, `reconciledQuantity`), so only the *values* are misspelled. They are
> kept in `RECONCILIATION_TYPES` so the misspelling lives in exactly one place, and the UI
> labels them "In" and "Out" rather than showing it to the user.

> 🔴 **The route returns `404 ROUTE_NOT_FOUND`.** Five path spellings were tried
> (`/reconciliation`, `/reconcilliation`, `/reconcilation`, `/reconciliations`, `/reconcile`,
> plus top-level variants) and all 404. A missing route is distinguishable from a rejected
> body: a deployed route would answer an empty `{}` with `VALIDATION_ERROR`, not
> `ROUTE_NOT_FOUND`.
>
> **The schema is already live**, which is why this is worth wiring now: every row carries
> `reconciledQuantity` and a `clearances[]` ledger, the summary reports `reconciledQuantity`
> and `clearanceQuantitiesByStatus: { uncleared: 510 }`, and each clearance's
> `transactions[]` entries carry a `type` (`received` so far) — the ledger a reconciliation
> writes into. Only the endpoint is absent.
>
> Unlike the transaction endpoint below, the service **does** ship this method, because the
> feature was explicitly requested. A `404` is caught by code and reported as *"Reconciliation
> is not available yet on the server"* rather than a raw error, so it cannot be mistaken for a
> bug in the form.

**The clearance control offers only the states the receipt actually holds.** It is derived
from that receipt's own `clearances[]`, not from the full enum:

| the receipt holds | offered | control |
| --- | --- | --- |
| all `uncleared` *(every receipt today)* | Uncleared | locked |
| all `cleared` | Cleared | locked |
| some of each | Cleared, Uncleared | choosable |
| no clearances at all | both *(fallback)* | choosable |

A receipt that has never been cleared has no cleared quantity to adjust, so offering
`cleared` would invite an adjustment against nothing. All five live receipts are entirely
`uncleared`, so the control is locked to Uncleared today — but this widens on its own once
clearing happens, with **no code change**. The receipt panel shows the breakdown
(`250 uncleared`) so the locked control reads as a fact about the receipt rather than a
limitation of the form.

**Gated on `central.stock.edit`**, not `create`: it adjusts an existing receipt, and the API
exposes no permission of its own for it (no `central.stock.reconcile` exists). The action sits
on each **receipt** inside the expanded row, not on the item group, because a reconciliation
targets one `centralStockId`.

An **outward** adjustment is bounded client-side by the receipt's `remainingQuantity`, and the
resulting figure is shown before submitting (`250 − 30 = 220 LT`) so a wrong direction is
visible. The bound is advisory only — with no endpoint there is nothing server-side to enforce
it yet.

> 🔴 **The transaction endpoint does not exist yet.** `POST /central-stock/transaction`
> returns `404 ROUTE_NOT_FOUND` under both JSON and multipart, as does `GET`. A sweep of
> seventeen candidate spellings (`/transactions`, `/central-stock-transaction`, `/sale`,
> `/movement`, …) found nothing. One near-miss is a decoy: `GET /stock/transaction` returns
> `400` rather than `404`, but that is `/stock/:id` parsing "transaction" as an id — it
> gives the identical `Must be a valid UUID` error as any other non-UUID.
>
> So `{ centralStockId, quantity, type: "saleOut" }` cannot be wired yet. **`remainingStock`
> is already being computed** server-side (288 received, 258 remaining on the existing
> record), so the mechanism exists behind the API — only the route is missing. The service
> deliberately ships **no** transaction method rather than one that always 404s; add it
> there when the backend exposes the route.

> ⚠️ **Only two routes exist.** `GET /central-stock/:id`, `PUT`, `PATCH`, `DELETE` and
> `PUT /central-stock/status/:id/:status` all return `404`. The page is therefore list plus
> create, with no edit and no status control.

> ⚠️ **This is the third `multipart/form-data` endpoint**, after cargo and T1 validation.
> The file field is `supportingDocUrl`, matching T1 validation — cargo uses
> `supportingDoc`.

> ⚠️ **`supportingDocUrl` comes back root-relative** (`/uploads/…`) where cargo returns an
> absolute URL. Uploads are served from the server root rather than under the API prefix,
> so the link resolves the path against the page's own origin — which is also what makes it
> work behind the dev proxy.

> 🔴 **`GET /central-stock` now returns one entry per *item***, like `/stock` — each group
> is `{ item, summary, stocks[] }`. The table renders items as rows, with their receipts
> expanding beneath.

> 🔴 **`quantity` and `remainingStock` are gone.** A receipt now carries five figures that
> track its life: `quantityBeforeTransactions`, `receivedQuantity`, `reconciledQuantity`,
> `soldOutQuantity` and `remainingQuantity` — all **numbers**. Confirmed against live data:
>
> ```
> remainingQuantity = receivedQuantity - reconciledQuantity - soldOutQuantity
> ```
>
> The table leads with **Remaining**, and a **Movement** column spells out the deductions —
> but only those that are non-zero, so an untouched receipt stays uncluttered.

> ⚠️ **Clearance is a second, independent dimension.** `quantitiesByStatus` reports the
> stock status (`inStock`), `clearanceQuantitiesByStatus` the customs status (`uncleared`) —
> stock can be in hand yet not cleared, so each gets its own column rather than being
> conflated.

Each receipt nests its `depot`, the `t1Validation` it arrived against (with that
nomination's destination), and a `clearances` array. A clearance carries the customs side —
agent, fees, amount, documents — but **all of those are `null` until it is processed**, so
each is rendered only when present. Its `transactions` give the audit trail: who moved what,
and when.

```
AGO   50 LT   50 received   uncleared 50   inStock 50   1 receipt
  Rwanda (Kigali, Muhima · local)                50 LT
  via tranzaniya → Kigali m                      [inStock]  Doc
  [uncleared] 50 LT
     received 50 LT · System Administrator
```

The nested `item` carries a resolved `baseUnit` **object** — a third item shape, distinct
from `ItemNode` and `ItemDetail`, which both carry a bare `baseUnitId`.

> 🔴 **The item is derived from the T1, not chosen.** A T1 validation nests
> `nomination.stock.item`, so it already determines which item is being received. The form
> therefore shows the item read-only and submits its id — `itemId` is still **required by
> the API**, so it is derived rather than dropped. This is the same treatment `currancyCode`
> gets on PFI, for the same reason: two inputs that must agree cannot disagree if only one
> is entered. Asking again would let a user record AGO against a T1 for something else.
>
> If a chosen T1 carries no item there is nothing valid to send, so the form reports that
> against the picker rather than submitting a blank id.

The panel also shows the **nominated quantity**, and the input is labelled *Received
quantity* — what arrives may legitimately differ from what was nominated, which is the
point of recording it, so a difference is noted rather than blocked:

```
AGO — 150 · Kigali m (tranzaniya · eerrer)   <- T1 option
Item: AGO · Diesel        Nominated: 150 LT  <- derived, read-only
Received quantity (LT)    placeholder 150
```

Two T1s can share an item, quantity and country, so the option includes the **customs
office** to tell them apart.

Permission codes are **dotted**: `central.stock.*`, not `central_stock.*` — the same trap
as T1 validation, verified in both directions.

### T1 validation

Transit validations raised against a nomination.

| Endpoint                              | Notes                                            |
| ------------------------------------- | ------------------------------------------------ |
| `GET /t1-validation`                  | Nests `nomination` **and** `extraValidations`.    |
| `GET /t1-validation/:id`              | **Neither** — only the parent's own fields.       |
| `POST /t1-validation`                 | **`multipart/form-data`**. Four required fields.  |
| `PUT /t1-validation/status/:id/:status` | Sets the status of an **extra validation**.     |

There is **no update and no delete** — verified: `PUT`, `PATCH` and `DELETE` on
`/t1-validation/:id` all return `404`. There is also no route to add a second extra
validation to an existing record, so create and the child status change are the only
writes. The form is therefore create-only.

**Central stock's T1 picker reads `GET /t1-validation/confirmed/validations`**, not the full
list — stock should not be received against transit whose customs checks have not cleared.
Its response shape is identical to the list, so nothing else changed. The empty state names
the reason (`No confirmed T1 validations…`) rather than saying none exist, since unconfirmed
ones may well be present.

> ⚠️ **The two lists have been seen to disagree.** At one point the confirmed endpoint
> returned a record while `GET /t1-validation` returned none; later the reverse, with the
> full list showing a `confirmed` check while the confirmed endpoint returned `[]` across
> six consecutive samples. Both are consistently shaped and the client reads them as
> intended, but **an empty picker is worth checking against `/t1-validation`** before
> concluding nothing is confirmed.

**The table leads with the item in transit**, taken from the nomination's nested stock:

```
Item   Quantity   Exporting from   Status    Customs checks      Document
AGO    50 LT      tranzaniya       Pending   eerrer  [pending]   View
                                             Transit etet
```

> ⚠️ **The nomination nested here is trimmed.** It carries `quantity`, `stockId` and
> `stock.item`, but **no `destination` and no `driverVehicle`** — unlike the `/nominations`
> list, which has both. The table previously led with `destination` and would now render a
> dash, so it leads with the item instead. The item has a bare `baseUnitId`, so the unit is
> resolved from the units list and the parent from the items tree.

**A `Status` column rolls the customs checks up**, since a T1 has no status of its own: any
cancellation dominates, all-confirmed clears it, anything else is pending. With more than
one check it also shows `n of m confirmed`, so a partly-cleared transit is visible without
reading the list beside it.

> 🔴 **The status lives on the child, not the parent.** A T1 validation has no status of
> its own; each `extraValidations` entry carries one, and
> `PUT /t1-validation/status/:id/:status` takes the **child's** id. Values are `pending`,
> `confirmed`, `cancelled` — note **`confirmed`**, where cargo uses `approved`. The table
> therefore renders one status control per customs check rather than one per row.

> 🔴 **`customOffice` and `transitNumbering` are required on create but are not fields of
> the record.** They seed the first `extraValidations` entry. The detail endpoint returns
> neither, which is consistent with them belonging to the child — and is another reason
> the form is create-only, since it could not round-trip them.

> 🔴 **T1 validations are raised from the PFI page, not from here.** The T1 page is
> **display only** — no New button. Each PFI row carries a **T1** action.
>
> ⚠️ **A T1 belongs to a nomination, not to a PFI.** There is no `pfiId` — creating one
> requires `nominationId`, so PFI and T1 are **siblings** off the same nomination:
>
> ```
> nomination ──┬── PFI            (pfi.nominationId)
>              └── T1 validation  (t1.nominationId)
> ```
>
> The PFI row therefore passes its **own `nominationId`** through, and the button is
> disabled when a PFI has none. A consequence worth knowing: if one nomination ever carries
> **two PFIs**, both rows would offer to create a T1 for the same nomination. Raising them
> from Nominations instead would avoid that, at the cost of a longer action row there.
>
> The **per-check status control stays on the T1 page** — it is a separate endpoint from
> create, and still gated on `t1.validation.edit`.

> ⚠️ **This is the second `multipart/form-data` endpoint in the API**, after cargo,
> because the record carries an uploaded document. As there, **no `Content-Type` is set** —
> axios writes it with the `boundary=` parameter that a hand-written header would omit.

> ⚠️ **The permission codes are dotted: `t1.validation.*`, not `t1_validation.*`** — even
> though the module code is `T1_VALIDATION`. `PERMISSION_MODULES.t1Validation` is therefore
> `'t1.validation'`. The permission helper already supports dotted module codes
> (`suppliers.type` is the precedent), so nothing else needed changing. Verified in both
> directions: the five dotted codes exist and no `t1_validation.`-prefixed code does.

> ⚠️ **The file field is named `supportingDocUrl`** — the *URL* suffix, on an upload —
> matching the working request this was built from. Cargo spells the same thing
> `supportingDoc`. The API does not reject an unknown file field name, so this could not be
> confirmed by probing; only a successful upload would show it, and that would mean writing
> a record. **Worth re-checking on the first real upload.**

The document link reuses the cargo URL guard, since the same backend produces both and has
been seen to emit concatenated values like `https://host.rwfile:///home/…`.

### PFI and currencies

Proforma invoices raised against a nomination. **Currencies have no module of their own** —
they live under `/pfi/currency` and share the `pfi.*` permissions, so they are managed in a
panel on the PFI page rather than a separate screen.

| Endpoint                   | Notes                                                  |
| -------------------------- | ------------------------------------------------------ |
| `GET /pfi`                 | Nests `currency`; **omits `currencyId`**.               |
| `GET /pfi/:id`             | Flat `currencyId`; **no nested `currency`**.            |
| `POST /pfi`                | JSON. Six required fields.                              |
| `PUT /pfi/:id`             | Same body.                                              |
| `GET /pfi/currency`        | Full records — the list is all the edit form needs.     |
| `POST /pfi/currency`       | JSON. `code`, `name`, `rate` all required.              |
| `PUT /pfi/currency/:id`    | Same body. No GET-by-id, `PATCH` or `DELETE`.           |

Neither resource has a delete endpoint, so editing is the only correction path.

> 🔴 **Two field names are misspelled, in different ways.** Both are reproduced verbatim
> because they are the wire format:
> - **`currancyCode`** — "currancy", on both read and write.
> - **`pifCode`** — "pif", not "pfi". It is **server-generated** (`PFI984CBADDD7`), so it
>   is never sent on create or update.

> 🔴 **`currancyCode` is stored verbatim and is *not* validated against `currencyId`.** The
> two can disagree — a record can claim `ZZZ` while pointing at the RWF currency. The form
> therefore **derives the code from the selected currency** and never offers it as an
> input, which is the only way they cannot drift. Because it has no field of its own, an
> API error naming `currancyCode` is reported against the currency picker that produced it.
>
> The table shows the **stored** code rather than the nested currency's, so an existing
> mismatch stays visible instead of being silently papered over.

> ⚠️ **The list and detail shapes are disjoint**, as with nominations: the list nests
> `currency` but omits `currencyId`; the detail returns `currencyId` and no nesting. The
> table renders from the list, and the edit form *must* read the detail — it is the only
> source of the id the form binds to.

`amount` and `rate` are **validated as numbers** but **returned as strings**, so they are
sent as numbers and parsed on the way back. Choosing a currency prefills its default rate,
which stays editable — a PFI records its own rate independently of the currency's.

**`GET /pfi` accepts `startDate` and `endDate`**, with the same day-widening as elsewhere.

> ✅ Both filters returned wrong results during development — the unfiltered list came back
> empty while records existed, and the two dates behaved as though reversed. The backend has
> since been fixed. Re-verified against PFIs created `2026-08-20T13:10`: the unfiltered list
> returns both, `startDate` before/after gives 2/0, `endDate` before/after gives 0/2, and a
> month-wide range returns both. A warning banner shown while it was broken has been removed.

> 🔴 **PFIs are raised from the Nominations page, not from here.** The PFI page is **list
> and edit only** — no New button. Each nomination row carries a **PFI** action:
>
> ```
> AGO   100   Kigali m   Pascal Driver   [PFI] [edit]
> ```
>
> It is gated on `pfi.create`, not on any nomination permission — the action belongs to the
> other module. Because the nomination is chosen before the form opens, **the form has no
> nomination picker**; it shows the nomination read-only instead.
>
> **Editing stays on the PFI page**, and so does the currencies panel: currencies are a
> lookup table shared by every PFI rather than anything to do with one nomination, and they
> share the `pfi.*` permissions.

**The amount is calculated, not typed.** A nomination carries a `quantity` and the currency
supplies a `rate`, so the amount is their product — neither input alone determines it:

```
Kigali m — 150 · Pascal Driver (ZZ0000)      <- nomination option
150 x 1,400 = 210,000 RWF                    <- amount, once a currency is chosen
150 x 1,500 = 225,000 USD                    <- switching currency recalculates
```

The arithmetic is shown rather than just its result, so a wrong quantity or rate is visible
in the figure it produced. The field **stays editable**: the API accepts any amount and a
PFI may carry an agreed figure that differs, so an edit is kept and flagged as *edited from
the calculated amount* rather than being silently overwritten.

> ⚠️ The recompute effect is keyed on the **quantity and rate**, not on the computed value.
> Writing the field re-renders, so keying it on the result would overwrite a manual edit the
> instant it was typed — the override would be unreachable. A ref guard holds the last
> written figure and is cleared when the dialog closes.

### Nominations

Stock allocated to a driver's vehicle for delivery.

| Endpoint                  | Notes                                                     |
| ------------------------- | --------------------------------------------------------- |
| `GET /nominations`        | Nests `driverVehicle`; **no ids, no date, no timestamps**. |
| `GET /nominations/:id`    | Flat ids and the date; **no nested relations**.            |
| `POST /nominations`       | JSON. All five fields required.                            |
| `PUT /nominations/:id`    | Same body. `PATCH` is not routed.                          |

There is no delete endpoint, and **a nomination has no status** — the status endpoint
listed alongside this feature is `stock/status/:id/:status`, which already belongs to the
[Stock](#stock) page.

> 🔴 **The date field is spelled differently on write and read.** Sent as
> **`expectedLoadingedDate`** — note the extra `ed` — and returned as
> **`expectedLoadingDate`**. Verified by sending the un-`ed` spelling, which the API still
> reported as missing. This mirrors the `paassport`/`passport` split on drivers, so the
> form maps API error fields back to form fields explicitly rather than by name.

> ⚠️ **The list and detail shapes are disjoint — neither is a superset.** The list nests
> `driverVehicle` (driver and vehicle inside) but carries **no ids and no date**; the
> detail returns `stockId`/`driverVehicleId` and the date but **no nesting at all**. So
> the table renders from the list, and the edit form *must* read the detail endpoint —
> there is no id in the list row to seed it with.

> ⚠️ **`driverVehicleId` is the assignment id, not the vehicle id.** It comes from
> `drivers[].vehicles[].id`, *not* `drivers[].vehicles[].vechile.id`. Verified both ways:
> the existing nomination's value appears among the assignment ids and **not** among the
> vehicle ids. The picker is built from flattened assignments for this reason.

`quantity` is coerced — a numeric string and a number are both accepted, a non-numeric
string is not — so it is sent as a number for consistency. The stock picker offers only
**received** stock, since nothing else can be allocated.

**`GET /nominations` accepts three filters**: `startDate`, `endDate` and `itemId`. The
page offers the two dates, widened to `23:59:59.999` on the end for the same reason as
stock — verified directly: `endDate=2026-08-20T00:00:00.000Z` returns **0 rows** where
`…T23:59:59.999Z` returns **2**.

> ✅ **`itemId` works.** It returned `500 INTERNAL_ERROR` for any valid UUID during
> development and shipped disabled for a while; the backend has since been fixed, and it is
> now enabled. Re-verified: 5 consecutive `200`s, correct results combined with the dates,
> and an unknown item id returning **0 rows rather than everything** — so it genuinely
> filters rather than merely no longer erroring.

> ⚠️ **The item options come from the items list, not from the nominations on screen.**
> Those are already filtered, so sourcing the picker from them would shrink the options to
> the chosen item and leave no way back to "All items". Only **leaves** are offered, since
> stock is held against a category rather than a class.

**The list nests the stock it draws from**, with both the `cargo` and the `item`, so the
table leads with *what* is being moved rather than only who is moving it:

```
Item      Quantity   From        Destination   Driver           Vehicle
AGO       100 LT     Vessel 3    Kigali m      Pascal Driver    ZZ0000
Diesel               BL 323                    +250784103864    Capacity 344
```

> ⚠️ **The nested stock carries no `id`.** It identifies the stock's *contents* but not the
> stock itself, so the edit form still reads `stockId` from the detail endpoint.

> ⚠️ **The item here has a bare `baseUnitId`, not the resolved `baseUnit` the `/stock`
> endpoint returns.** Two different item shapes for the same concept, so this page reads the
> units list to name the unit and the items tree to name the parent — each gated on its own
> module's permission.

**Each row expands to a timeline** — `GET /nominations/time-line/:id`. The list row carries
no status field at all (`id, quantity, destination, stock, driverVehicle`), so this is the
**only** place a nomination's progress is visible.

The lifecycle is a fixed five-stage ladder, verified identical across two nominations:

```
awaiting -> underLoading -> t1Pending -> t1Confirmed -> stockReceived
   L1           L2             L3            L4              L5
```

The API returns only the stages **reached**, so all five are always drawn and the unreached
ones show as `Pending` — a nomination at level 1 would otherwise look finished rather than
just started:

```
  Timeline                          Stage 1 of 5
   [x] Awaiting        2026-08-25 07:14
         · Awaiting loading documents
         by pascal NP
   [ ] Under loading         Pending
   [ ] T1 pending            Pending
   ...
```

> 🔴 **The timeline `id` is not unique — it encodes the *level*, not the entry.** Every
> nomination's level 1 is `550e8400-e29b-41d4-a716-446655440000`, level 2 is `…0001`, and so
> on; verified by comparing two separate nominations, whose level-1 ids are identical. Rows
> are therefore keyed by **`level`**. Keying by `id` would collide the moment two timelines
> were rendered together.

> 🔴 **An unknown id returns `{success: true, data: []}`, not a `404`.** "No such nomination"
> and "not started yet" are indistinguishable, so an empty array is rendered as **"Not
> started"** and never as an error.

> ⚠️ **`createdBy` is `null` on stages the system advanced itself** — level 4 is, in live
> data — and **one stage can carry several notes**: level 4 returns four. Notes are listed
> rather than joined.

The timeline is fetched **lazily**: the element is created per row, but `DataTable` renders
it only once expanded, so no request fires until someone opens a row. The action buttons
`stopPropagation`, or clicking **Edit** or **PFI** would also toggle the row.

> 🔴 **Nominations are raised from the Stock page, not from here.** The Nominations page is
> **list and edit only** — it has no New button. Each stock receipt in the Stock page's
> expanded row carries a **Nominate** action:
>
> ```
> > PMS   (expand)
>     Vessel 1  Dar   200 LT  [received]  [Nominate]
>     Vessel 2  Dar   200 LT  [received]  [Nominate]
> ```
>
> The button appears only on stock that is **received and has something left**, so it never
> opens a form that cannot be completed. It is gated on `nominations.create`, not on any
> stock permission — the action belongs to the other module.

Because the stock is chosen before the form opens, **the form has no item or stock picker
at all**. It shows the receipt read-only instead: re-picking it could only contradict where
the user started.

```
Stock   PMS                          Available  200 LT
        Vessel 1 · Dar · BL 123
```

An earlier version picked item-then-stock inside the form. That worked, but it asked the
user to re-find a receipt they had usually just been looking at.

> The **Nominate** button calls `stopPropagation` — the surrounding row toggles the expanded
> panel, so without it opening the form would also collapse the panel it was clicked from.
> The status dropdown beside it does the same.

> ✅ **`remainingQuantity` resolved the caveat noted here previously.** Stock now reports
> `quantityBeforeNominations`, `nominatedQuantity` and `remainingQuantity` per line, and the
> same three on the group summary — a genuine balance net of other nominations, which did
> not exist before.
>
> **Over-nominating is therefore blocked**, not merely warned about: exceeding the remainder
> would double-allocate the same stock. The submit button disables and the handler re-checks
> it, since a disabled button does not stop Enter. As with cargo, the API still accepts it —
> this is a client-side guard.

> 🔴 **`quantity` no longer exists on a stock row**, replaced by
> `quantityBeforeNominations`. Anything still reading `stock.quantity` silently gets
> `undefined`.

> **When editing, the nomination's own quantity is added back** to the stock's remainder —
> the same reasoning as the cargo form: `remainingQuantity` already counts the record being
> edited, so without this it could not be re-saved at its own value.

### Cargo

| Endpoint                        | Notes                                          |
| ------------------------------- | ---------------------------------------------- |
| `GET /cargo`                    | **Flat array**. Omits `orderId`.                |
| `GET /cargo/:id`                | ⚠️ Only 4 fields now — see below.               |
| `POST /cargo`                   | **`multipart/form-data`** — see below.          |
| `PUT /cargo/:id`                | Also multipart.                                 |
| `PUT /cargo/status/:id/:status/:date` | **Sets** the status. The **`:date` segment is required** — see below. |

> 🔴 **The cargo status route takes a fourth path segment — the decision date.** The full
> shape is `PUT /cargo/status/:id/:status/:date`, e.g.
> `cargo/status/cmsrhhmzq…/approved/2026-08-13T12:17:58.695Z`.
>
> The date is **required, not optional**: dropping it gives `404 ROUTE_NOT_FOUND` rather
> than a validation error, which is what made this look like a deleted route at first —
> the three-segment form 404s for every method and every status, even on ids that exist.
> Two segments is simply a different, unrouted path.
>
> The segment is validated as a date under the field name `date` (`not-a-date` →
> `400 VALIDATION_ERROR`), and both `2026-08-13T12:17:58.695Z` and `2026-08-13` pass. The
> service sends a **full ISO instant defaulted to now**, since this records *when the
> decision was taken* — a moment in time, unlike `receivedDate`, so the UTC calendar-day
> slicing used elsewhere deliberately does not apply here.
>
> Because the API records that date, **the confirmation dialog asks for it** rather than
> assuming today. It defaults to today and is capped there — a decision cannot be recorded
> as taken in the future. Today keeps the current time of day, since the decision really is
> being taken now; any other date is pinned to midnight UTC rather than inventing a time.
> Reverting to *pending* is an undo rather than a decision, so it skips the prompt and
> takes the service default.
>
> **`PUT` only.** `PATCH` and `POST` on the same path are not routed.
>
> Verified by generating the URL exactly as the service does and sending it with an
> invalid status: `status` came back as the *only* failing field, so the generated date
> cleared validation. Repeating it with a valid status and a fake id returned
> `RESOURCE_NOT_FOUND` — validation passed end to end, with no real record touched.

> 🔴 **Cargo is the only endpoint in this API that takes `multipart/form-data`.** A JSON
> body is refused outright with `406 FST_INVALID_MULTIPART_CONTENT_TYPE`, because the
> record carries an uploaded supporting document.
>
> `cargo.service.ts` builds a `FormData` and — importantly — **sets no `Content-Type`**.
> Axios detects the `FormData` and writes the header itself *including the `boundary=`
> parameter*; a hand-written `multipart/form-data` header would omit the boundary and the
> server could not parse the body. Verified by capturing the request off the wire.

**Seven fields are required**: `orderId`, **`deportId`**, `vesselName`, `receivedDate`,
`expirationDate`, **`quantity`**, `blRef`. `tansisRef`, `outurnRef` and the document are
optional.

> The contract changed after the first build: `qtyInKg` and `qtyInLts` were **replaced by
> a single `quantity`**, and **`deportId` was added**. Both confirmed against the live
> API.

**Cargo carries no unit of its own**, so the form takes the order's, and the quantity field
is labelled with it.

> **The order picker shows what is *outstanding*, not the order total.** An order for 1,000
> with 400 delivered offers `600 LT left`, and the summary reads `600 LT remaining of 1,000
> ordered`. Showing the total would invite shipping against quantity already delivered.

**Over-shipping is blocked.** Entering more than remains shows `Only 600 LT remaining on
this order`, disables the submit button, and is re-checked in the submit handler — a
disabled button does not stop Enter. An order with nothing left cannot be selected at all:
the picker reports it as fully delivered and blocks submission.

> This is a **client-side rule**: the API accepts an over-delivery (it is what produced the
> `-30` remainder documented under Orders). The intent is to prevent an accidental
> over-shipment, not to mirror a server constraint.

> 🔴 **The remainder is the API's figure, used as-is — nothing is added back.**
>
> An earlier version added the edited cargo's quantity back, reasoning that `remainingStock`
> already counted it. **That was wrong**: `remainingStock` is derived from **stock**, not
> from cargo. The two coincide only while every cargo has produced matching stock, so the
> add-back inflated the remainder — an order with 500 left reported **1,500 remaining of
> 1,000 ordered**, which is how the bug surfaced.
>
> The consequence is that editing cannot raise a cargo's quantity beyond what the order still
> has outstanding. That is the correct constraint: the shipment's own quantity is already
> reflected in `remainingStock` through its stock.

> 🔴 **Only *pending* cargo can be edited.** Approving raises stock against the shipment and
> cancelling withdraws it — either way the record has been acted on, so amending its quantity
> afterwards would leave the cargo and its stock disagreeing. Approved and cancelled rows show
> a dash in place of the edit icon.
>
> The status dropdown stays available, so a decision can be reverted to *pending* — which
> re-enables editing. That keeps a genuine correction possible without letting one happen
> silently underneath committed stock.

The cargo table still shows `of N ordered` beneath the quantity **only when the two
differ**, since that is the case worth noticing.

> ⚠️ **Empty strings pass server-side validation.** Probing with `orderId=""` reports only
> the four non-string fields as missing, so the API would accept a blank vessel name or BL
> reference. The form's `.min(1)` rules are what actually prevent that.

> ⚠️ **`quantity` crosses the string/number boundary** — returned as a string (`"288"`),
> sent as a number.

> 🔴 **`GET /cargo/:id` no longer returns most of the record.** It now yields only four
> fields — `quantity`, `deportId`, `supportingDocUrl`, and a nested `order` carrying just
> `itemId` (**no `id`**). `vesselName`, `receivedDate`, `expirationDate`, `blRef`,
> `tansisRef` and `outurnRef` are **absent entirely**, which left the edit form showing them
> blank.
>
> **The edit form therefore merges both endpoints**, because each holds a different half:
>
> | | Order | Deport | Vessel, dates, refs |
> | --- | --- | --- | --- |
> | `GET /cargo` | nested `order` (with `id`) | nested `deport` | ✅ all present |
> | `GET /cargo/:id` | nested `order` — `itemId` only | flat `deportId` | ❌ none |
>
> The detail wins where it has a value, so if it regains those fields the merge keeps
> working unchanged. Submit stays disabled until **both** requests land — saving on a
> half-loaded record would write blanks over the fields the other endpoint carries.
>
> Verified across all four cargo records: every field populates. (One older record has
> `tansisRef: null`, which is a genuinely empty optional, not a gap.)
>
> `stocks` is empty on every record so far, so its element shape is unconfirmed and typed
> as `unknown[]` rather than guessed at.

> ⚠️ **Some `supportingDocUrl` values are malformed.** The API has produced
> `https://petrox.quicko.rwfile:///home/pasco/pnpm-lock.yaml` — the base URL concatenated
> with a local path, with no separator. It parses as a valid URL (hostname
> `petrox.quicko.rwfile`) but navigates nowhere.
>
> The table checks the **raw string** for a second `scheme://` before rendering a link,
> and shows a non-clickable "Invalid link" otherwise. Inspecting the parsed `URL` parts
> does not catch it — that was the first attempt, and it failed against the real value.
> **The concatenation should be fixed on the backend**, where the value is stored.

Status is a **set with three values** — `pending`, `approved`, `cancelled` — chosen from a
dropdown rather than toggled, with approve and cancel confirmed first.

### Drivers

| Endpoint                  | Notes                                                     |
| ------------------------- | --------------------------------------------------------- |
| `GET /drivers`            | **Flat array**. Omits `transporterId`.                     |
| `GET /drivers/:id`        | Adds `transporterId` and timestamps.                       |
| `POST /drivers`           | Body `{ names, phone, lisence, paassport, transporterId }`. |
| `PUT /drivers/:id`        | Same body.                                                 |
| `PUT /drivers/status/:id` | Toggles `active` ↔ `inactive`. No body.                    |

All five fields are required. Note the API's spellings: **`names`** (plural),
**`lisence`**, and — the awkward one below — **`paassport`**.

> 🔴 **The passport field is spelled differently on write and read.** `POST`/`PUT` require
> **`paassport`** (two `a`s); every response returns **`passport`** (one). Confirmed from
> both the API's validation error and its list/detail payloads.
>
> The form uses `passport` internally and maps to `paassport` only when submitting, and
> its error mapping accepts both spellings so a server-side message lands on the right
> input either way. **Aligning the request field to `passport` would remove the trap.**

> ⚠️ **The list omits `transporterId`** — only the detail endpoint returns it. The edit
> dialog therefore fetches the record rather than seeding from a row, the same pattern as
> orders. Adding it to the list rows would remove that extra request.

#### Assigning a vehicle

`PUT /drivers/assign/{vehicleId}/{driverId}` — bodyless, so `Content-Type` is stripped.

> ⚠️ **The path order is not derivable from the API.** Every combination returns
> `409 RELATION_CONFLICT` — including two nonexistent ids, and the real vehicle+driver
> pair — so the error never reveals which side failed. **Vehicle-first was confirmed by
> the user**, not by probing. If assignments start failing, this is the first thing to
> re-check.

**Assignments are now readable** on `GET /drivers`, as a `vehicles` array:

```jsonc
"vehicles": [
  {
    "id": "dac75c88-…",          // the ASSIGNMENT's id, not the vehicle's
    "vechile": {                  // ⚠️ the API's spelling — missing an `h`
      "id": "a9df13d1-…",
      "platNumber": "RAB74811",
      "model": "334",
      "status": "active"
    }
  }
]
```

> ⚠️ **Two traps in that shape.** The outer `id` is the assignment record, so reading it
> as the vehicle id would send the wrong value to the assign endpoint. And the nested key
> is **`vechile`**, not `vehicle` — verified against the live payload.

> ⚠️ **`vehicles` is on the list only**; `GET /drivers/:id` still omits it, just as the
> list omits `transporterId`. The table is therefore the only source of a driver's
> assignments, and the dialog reads them from the row it was opened with.

A driver can hold **several** vehicles — the field is an array — so the table renders one
badge per plate and the dialog lists what is already assigned, excluding those from the
picker.

The dialog offers **every active vehicle** the driver does not already hold, grouped by
transporter with the driver's own listed first under a `(same)` heading.

An earlier version filtered to the driver's own transporter, which left a driver with no
options whenever their company's trucks were all taken. Grouping keeps a cross-company
assignment possible but deliberate, rather than an accident of alphabetical ordering. The
API remains the authority on whether a pairing is legal — it answers `RELATION_CONFLICT`
if not.

### Vehicles

| Endpoint                   | Notes                                                    |
| -------------------------- | -------------------------------------------------------- |
| `GET /vehicles`            | **Flat array**, nesting a `transport` summary.            |
| `GET /vehicles/:id`        | Timestamps instead of the nested `transport`.             |
| `POST /vehicles`           | Body `{ platNumber, transporterId, truckNumber, trailerNumber, model, tankCapacity }`. |
| `PUT /vehicles/:id`        | Same body.                                                |
| `PUT /vehicles/status/:id` | Toggles `active` ↔ `inactive`. No body. **Verified.**     |

**All six fields are required.** Note the API's spelling: **`platNumber`**, one `e`.

> **Unlike orders, a list row keeps its foreign key.** Each vehicle carries both the flat
> `transporterId` *and* a nested `transport` summary, so the edit form seeds straight from
> a row with no extra request.

> ⚠️ **`tankCapacity` crosses the string/number boundary.** It is returned as a **string**
> (`"344"`) but the empty-body rejection says it expects a **number** — so the form coerces
> on submit. In practice a numeric string is accepted too; sending a number is simply the
> stricter of the two shapes.

The form guards duplicate plate numbers case-insensitively and uppercases them on submit.

### Transporters

| Endpoint                       | Notes                                             |
| ------------------------------ | ------------------------------------------------- |
| `GET /transporters`            | **Flat array**. Omits `updatedAt`.                 |
| `GET /transporters/:id`        | The same shape **plus `updatedAt`**.               |
| `POST /transporters`           | Body `{ name, phone, address, tinNumber }`.        |
| `PUT /transporters/:id`        | Same body.                                         |
| `PUT /transporters/status/:id` | Toggles `active` ↔ `inactive`. No body.            |

**All four fields are required** — confirmed by the API's own rejection. The form guards
duplicates on **TIN and name** before submitting, since a repeated TIN identifies the same
business.

> **The status toggle is unverified.** It follows the same bodyless-`PUT` contract as the
> other status endpoints, but confirming it would have mutated data. Create and update
> are likewise built but not exercised.

### Deports

| Endpoint                  | Notes                                            |
| ------------------------- | ------------------------------------------------ |
| `GET /deports`            | **Flat array** of `{ id, name, type, location, status, createdAt }`. |
| `GET /deports/:id`        | The same shape as a list row.                     |
| `POST /deports`           | Body `{ name, type, location }`.                  |
| `PUT /deports/:id`        | Same body.                                        |
| `PUT /deports/status/:id` | Toggles `active` ↔ `inactive`. No body.           |

`type` is one of **`local`**, **`foreign`**, or **`international`** — the API rejects
anything else and names all three in the error.

> ⚠️ **Only `name` and `location` are required.** `type` is optional server-side, even
> though every returned row has one. The form requires it anyway: a deport with no type
> would be meaningless in the table, and the API constrains the value when it is sent.

> **The status toggle is unverified.** It follows the same contract as the other status
> endpoints — bodyless `PUT` with `Content-Type` stripped — but confirming it would have
> mutated data. Create and update are likewise built but not exercised.

### Orders

| Endpoint                          | Notes                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| `GET /orders`                     | **Flat array** with nested `item`, `supplier`, `plan`, `createdUser`. |
| `GET /orders/by-supplier-or-plan` | Filtered list. Params **`supplierId`** and **`planId`**.       |
| `POST /orders`                    | Body `{ supplierId, orderDate, itemId, orderPlanId, quantity }`. |
| `GET /orders/:id`                 | One order. **Unstable — see below.**                           |
| `PUT /orders/:id`                 | Same body as create. `PATCH` and `DELETE` both 404.            |

> ⚠️ **The filter parameter is `planId`, not `orderPlanId`.** Creating an order uses
> `orderPlanId`; filtering uses `planId`, and passing `orderPlanId` here returns 404.
> Passing **no** parameters also 404s, so `use-orders.ts` falls back to plain `GET /orders`
> when nothing is selected rather than sending a request that cannot succeed.

The list also carries `orderPlanId`, a nested `plan`, a `cargos` array and a `stockCargos`
count. **The cargo form reads `quantity` and `item.baseUnit.code` from here**, so choosing
an order shows how much was ordered and in which unit — cargo has no unit of its own, and
the number is meaningless without one.

> ✅ **`stockCargos` is now confirmed: it is the *sum* of the nested stock quantities**, not
> a count of cargo records. An order whose stocks are 50 + 40 + 40 reports `130`. It was
> previously left unused because `0` on every record could not distinguish the two
> readings; real deliveries settled it.

`remainingStock` completes the pair: it is `quantity - stockCargos`, computed server-side.

> ⚠️ **`remainingStock` goes negative when an order is over-delivered** — an order for 100
> with 130 delivered reports `-30`. It is displayed as *over* rather than as a negative
> remainder, but any arithmetic on it must not assume a non-negative balance.

The **Delivered** column reads the server's own figure rather than subtracting locally, so
the two can never disagree. Only a difference is called out. Rows with deliveries are
**expandable**: clicking one lists each cargo's quantity, the running total, and the
outstanding balance.

```
> ORD-B2767446B844    Quantity: 100 LT    Delivered: 130 LT
                                          30 over          (amber)
    Cargo 1                      50 LT
    Cargo 2                      40 LT
    Cargo 3                      40 LT
    Total delivered             130 LT  of 100 ordered
    Over-delivered by            30 LT                     (amber)

> ORD-78F27EF62A2D    Quantity: 1,200 LT  Delivered: 300 LT
                                          900 remaining
    Cargo 1                     300 LT
    Total delivered             300 LT  of 1,200 ordered
    Still to deliver            900 LT
```

> ⚠️ **The nested cargo is trimmed to almost nothing** — each entry carries only a `stocks`
> array, and each stock only a `quantity`. There is **no cargo id, vessel name or date**, so
> deliveries can be totalled and listed but not individually identified; the panel numbers
> them `Cargo 1…n` rather than naming them.

A chevron marks which rows expand, since orders with no deliveries stay non-clickable. The
Edit button calls `stopPropagation`, or editing would toggle the panel too. `DataTable`
gained a generic `renderExpanded` prop for this — returning `null` leaves a row inert, and
the open panel closes on paging or filtering so it never trails a row that has moved.

All five fields are required. **`createdByUserId` is not accepted** — the API derives the
creator from the access token, confirmed by its own validation response listing exactly
five required fields.

The form sources its dropdowns from the existing features: order plans, suppliers, and
items. Only **active** plans and suppliers are offered, plus whichever the order being
edited already uses.

#### Items are chosen level by level

The item tree is three deep, and each level means something different:

| Depth | Level      | Example |
| ----- | ---------- | ------- |
| 0     | Class      | Fuel    |
| 1     | Item       | Petrol  |
| 2     | Category   | PMS     |

`ItemCascadeSelect` renders one select per level rather than a single indented list —
"PMS" on its own says little without its ancestors. **Only a leaf can be submitted**: a
node with children sets no value, so `itemId` is always the thing actually being ordered.

Two cases the component handles:

- **Switching a higher level clears everything below it**, so a stale Category can never
  survive a change of Item.
- **A Class with no children is selectable directly** — the deeper selects are not
  rendered at all, rather than shown empty and unsatisfiable.

Reopening the form rebuilds the full path from the stored leaf, so an edit shows
`Fuel > Petrol > PMS` rather than three empty selects.

> The earlier `500` on `GET /orders` has been **fixed** — the list now works and is
> verified, along with both filters.

> ⚠️ **`quantity` arrives as a string**, not a number (`"12000"`). It is parsed before
> formatting so the table can right-align and group digits.

> ⚠️ **The list and detail endpoints return different shapes**, and the difference
> matters:
>
> - `GET /orders` **nests display data without ids** — `supplier: { name, phone }`,
>   `item: { name, baseUnit, status }` — and has no `orderPlan` at all.
> - `GET /orders/:id` is **flat and carries the foreign keys**: `supplierId`, `itemId`,
>   `orderPlanId`, plus `createdByUserId` and timestamps.
>
> **This is why the edit dialog fetches the detail rather than being handed a row** — the
> form needs those three ids to seed its dropdowns, and the list cannot supply them. Both
> query keys sit under `['orders']`, so saving invalidates the detail and every filtered
> list in one call.
>
> It also means **a row's order plan cannot be shown in the table**, only filtered on.
> Adding the three ids to each list row would remove both the extra request and that gap.

> `GET /orders/:id` was returning `null`, then `500`, in earlier sessions. It is **stable
> now** and verified against every existing order. It still returns `{ data: null }`
> rather than 404 for an id that no longer exists, so callers check for null instead of
> catching.

### Order plans

| Endpoint                                    | Notes                                    |
| ------------------------------------------- | ---------------------------------------- |
| `GET /orders/order-plan`                    | **Flat array** of `{ id, name, status }`. |
| `GET /orders/order-plan/:id`                | The same three fields — no extra detail.  |
| `POST /orders/order-plan`                   | Body `{ name, startDate, endDate }` (ISO 8601). |
| `PUT /orders/order-plan/:id`                | Same body.                                |
| `PUT /orders/order-plan/status/:id/:status` | **Sets** the status; target state in the path. |

> ⚠️ **The status endpoint is a `set`, not a toggle** — unlike every other status
> endpoint in this API. The target state goes in the path, and there are **four** values,
> not two:
>
> `active` · `closed` · `terminated` · `force_closed`
>
> Discovered by posting an invalid status, which the API rejects with the full list and
> changes nothing. The table therefore uses a dropdown rather than a switch, and confirms
> the three non-active transitions.

> ⚠️ **The list returns `startDate` and `endDate`; the detail endpoint does not.**
> Verified across every plan — `GET /orders/order-plan` includes both dates, while
> `GET /orders/order-plan/:id` still returns only `{ id, name, status }`.
>
> This is why the dates are optional on `OrderPlan`. The UI is unaffected because the
> edit form opens from a table row, which has them; anything relying on the detail
> endpoint alone would not. Adding the dates there would remove the inconsistency.

The form takes calendar dates (`<input type="date">`) and converts them to the ISO
instants the API expects, and guards duplicate names case-insensitively.

**Dates are handled as UTC calendar days throughout.** The date part is sliced from the
ISO string rather than read through local `Date` getters, and displayed with
`timeZone: 'UTC'` — otherwise a plan starting `2026-08-11T00:00:00Z` would render as the
10th for any viewer behind UTC.

### Suppliers

| Endpoint                     | Notes                                              |
| ---------------------------- | -------------------------------------------------- |
| `GET /suppliers`             | **Flat array**, each row nesting its `supplierType`. |
| `GET /suppliers/:id`         | Flat `supplierTypeId` instead, plus timestamps.      |
| `POST /suppliers`            | Body `{ name, phone, address, tinNumber, supplierTypeId }`. |
| `PUT /suppliers/:id`         | Same body.                                          |
| `PUT /suppliers/status/:id`  | Toggles `active` ↔ `inactive`. No body.             |

> ⚠️ **The list and detail endpoints disagree**, same as `/items`:
>
> - `GET /suppliers` nests the type as an object — `supplierType: { id, type, status }` —
>   and has **no** `supplierTypeId`.
> - `GET /suppliers/:id` returns a flat `supplierTypeId` with **no** nested object, plus
>   `createdAt`/`updatedAt` that the list omits.
>
> They are typed separately (`Supplier` vs `SupplierDetail`) rather than pretending to be
> one shape. The edit form reads the id out of the nested object.

The form guards duplicates on **TIN and name** before hitting the API — a repeated TIN
almost always means a mistake, since it identifies a business. Inactive supplier types
are excluded from the dropdown unless the supplier being edited already uses one. There
is no delete endpoint, so editing is the only correction path.

> **The write endpoints are built but not exercised.** Only the `GET`s were called during
> development; create, update, and status were left untested to avoid writing to the
> shared dev database. The status endpoint follows the same contract as the other
> toggles — bodyless `PUT`, flips rather than sets, `Content-Type` stripped — but that is
> inferred from the pattern, not verified here.

### ⚠️ An empty-string name is accepted

`[{ "name": "" }]` creates a nameless module, while `[{}]` is correctly rejected. The
form blocks this client-side (`z.string().trim().min(1)`, verified), so it cannot be
created through the UI — but the endpoint should reject it too. The nameless module that
this produced in the dev data has since been deleted.

### ⚠️ Two issues in the password-reset endpoint

Both are backend-side; the frontend works around them but cannot fix them.

**1. The reset token is returned in the HTTP response.** That token is enough to set a
new password, so returning it to whoever posts the email address means anyone can reset
any account they know the address of. The client never reads the field, but the token is
still on the wire and in any proxy log. *Fix:* email it, return only `{ expiresAt }`.

**2. The endpoint discloses which emails have accounts** — 201 for a registered address,
`404 USER_NOT_FOUND` otherwise.

`forgot-password-page.tsx` **surfaces this deliberately**, showing "No PetroX account
uses this email address." under the input. That is a considered trade, not an oversight:
this is an internal console where accounts are created by an administrator and never
self-registered, so catching an administrator's typo is worth more than concealing which
addresses are registered. The status code leaks it regardless.

**If this app ever gains a public-facing or self-service reset flow, revisit that
branch** — on a public form the correct behavior is the neutral confirmation, since the
form would otherwise let anyone enumerate account holders.

## Current state

**Built:** login, the full password-reset flow (request → emailed link → set new
password), session restore, protected/public route guards, permission-aware sidebar, app
shell with theme toggle and sign-out, profile page.

### Testing the reset flow without email

The emailed link should point at `/reset-password?token=<token>`.

While the backend still echoes the token in the request response, **the dev server shows
that token with a one-click "Open the reset link" button** on the forgot-password
confirmation. It is gated behind `import.meta.env.DEV`, so it is stripped from production
builds — verified absent from `dist/`. Remove that block once the token stops being
returned (see the security note above).

**Known gaps:**

- **Dashboard is a placeholder.** `/dashboard/stats`, `/dashboard/stations`, and
  `/dashboard/activity` all return `ROUTE_NOT_FOUND`.
- **Users and Roles pages are not built.** Both endpoints exist and return
  `Paginated<T>`, but see the permissions note below.

### ⚠️ The admin account currently has no permissions

`POST /auth/login` returns `permissions: []` for `admin@petrox.local`, and the JWT
carries `[]` too — so `GET /users` and `GET /roles` both return `403 FORBIDDEN`. Earlier
the same account returned seven permissions, so this is a backend-side change, not a
client bug.

Until it is restored, permission-gated nav items stay hidden and those endpoints cannot
be consumed.

## Verification

`npm run build` passes: typecheck clean, lint clean apart from the same
`only-export-components` warnings the previous console has on its shadcn primitives.

Verified against the live API (14 checks): login and store wiring, `can()` semantics,
`errorCode` / `errorMessage` / `fieldErrors` against real 401 and 400 responses, 403
surfaced as a permission error rather than a session expiry, and **4 concurrent 401s →
1 refresh → all recovered, with the rotated refresh token still redeemable afterwards**.

Password reset verified end-to-end against the live API (6 checks): wrong and malformed
tokens both reach the dead-end screen, a real token sets the password, **the same token
is rejected on reuse**, and the account still logs in afterwards.

Sidebar mapping verified against the live `/modules/sidebar` (12 checks): level
derivation (`SUPPLY_CHAIN` → module, `ORDER` → service, `NOMINATION` → feature), grouping
nodes correctly having no path, every returned code present in the registry, generated
routes unique, and every sidebar path resolving to a route.

Modules page verified against the live `/modules/list` (14 checks): **15 rows for 15
distinct modules with no duplicates** despite the repeated-children payload, hierarchy
preserved (`SUPPLY_CHAIN` → `ORDER` → `NOMINATION`/`PFI`/`T1_VALIDATION`), children
following their parent, permissions and icons attached, the nameless module rendering
harmlessly, and features excluded from the parent dropdown.

Module creation verified separately: duplicate name → `RESOURCE_CONFLICT` mapped onto the
name input, and create storing `code`, `icon`, and `parentId` correctly. Client-side name
validation verified (6 checks).

Users page verified against the live API (13 checks): `USERS` present in the module tree
and mapped to `/users` under System Settings, routes generated and unique, and the role
dropdown loading and filtering to active roles.

Nozzles verified **read-only** against the live API (15 checks): routing and module mapping,
`NOZZLE` confirmed in the sidebar tree, all five `nozzle.*` codes, the five required fields,
the list confirmed to nest **all three** relations while the detail returns their flat ids,
and the pump's `siteId` resolving to a real site. Two checks confirm the site constraint the
form enforces: the nested **display's `pumpId` matches the nested pump**, and the nested
**cuve's `siteId` matches the pump's**. Every route was mapped with a fake id and no writes.

Cuves verified **read-only** against the live API (14 checks): routing and module mapping,
`CUVE` confirmed in the sidebar tree, all five `cuve.*` codes, **all six fields confirmed
required including `deadStock`**, the list confirmed to nest both `item` and `site` while
the detail returns their flat ids, the levels confirmed to come back as strings, and every
nested item's `baseUnitId` resolving to a real unit. Coercion was mapped separately: `""`,
`null`, numbers and numeric strings all pass; a non-numeric string does not. Every route was
mapped with a fake id and no writes.

Displays verified **read-only** against the live API (13 checks): routing and module
mapping, `DISPLAY` confirmed in the sidebar tree, all five `display.*` codes, the three
required fields, **`status` confirmed present on the list** (unlike pumps), the detail
confirmed to carry `pumpId` without nesting, and every nested pump's `siteId` resolving to a
real site. Every route was mapped with a fake id and no writes.

Pumps verified **read-only** against the live API (14 checks): routing and module mapping,
`PUMP` confirmed in the sidebar tree, all five `pump.*` codes, both fields confirmed
required, the disjoint list/detail shapes confirmed in both directions, every pump's status
confirmed resolvable from the sites nesting, and every nested `site.id` resolving to a real
site.

**Every route was mapped with a fake id and no writes.** `PUT /pumps/:id` and
`PUT /pumps/status/:id` returned `RESOURCE_NOT_FOUND` (route exists, id rejected); `PATCH`
and `DELETE` returned `ROUTE_NOT_FOUND` (no such route). The two error codes are what make
the distinction readable without touching data.

PSS verified **read-only** against the live API (14 checks): routing and module mapping,
the backend code confirmed as `PSS`, **its presence in the sidebar tree** (three levels
down, so a placeholder would otherwise have shadowed it), all five `pss.*` codes, **only
`name` confirmed required**, **`email` confirmed format-validated**, the optional fields
confirmed `null` when unset, and `pumps` confirmed present on the list.

Central stock verified **read-only** against the live API (14 checks): routing and module
mapping, the backend code confirmed as `CENTRAL_STOCK`, **all five permission codes
confirmed dotted** (`central.stock.*`) and the underscored form confirmed absent, the four
required fields read from the API's own rejection, **multipart confirmed** (a JSON body
returns `406`), the nested `item.baseUnit` object, **`quantity` confirmed a string while
`remainingStock` is a number** on the same record, and the root-relative document path.

The absent routes were verified too: detail, update, delete and status all `404`, and the
transaction route `404`s under seventeen spellings and both content types. **No data was
created, changed, or deleted:** every write probe omitted required fields, so none could
have succeeded.

T1 validation verified **read-only** against the live API (19 checks): routing and module
mapping, the backend code confirmed as `T1_VALIDATION`, **all five permission codes
confirmed dotted** (`t1.validation.*`) *and* the `t1_validation.`-prefixed form confirmed
absent, the four required fields read from the API's own rejection, **multipart confirmed**
(a JSON body returns `406 FST_INVALID_MULTIPART_CONTENT_TYPE`), the three statuses named by
the API's own rejection, **the status confirmed to live on the child and not the parent**,
`customOffice`/`transitNumbering` confirmed present on the child and absent from the
parent, every child's `t1ValidationId` pointing at its own parent, every nested nomination
resolving, and the existing document URL passing the guard.

Absence of update and delete was verified too: `PUT`, `PATCH` and `DELETE` on
`/t1-validation/:id` all `404`, as do three candidate routes for adding an extra
validation. **No data was created, changed, or deleted:** every write probe omitted required
fields or used an invalid status, so none could have succeeded.

PFI verified **read-only** against the live API (15 checks): routing and module mapping,
the backend code confirmed as `PFI`, all five `pfi.*` codes, both misspellings
(`currancyCode`, `pifCode`) confirmed present *and* their correctly-spelled variants
confirmed absent, the disjoint list/detail shapes, every `nominationId` resolving to a real
nomination, and every nested `currency.id` resolving to a known currency.

> ✅ **Resolved.** A stray `probe` record (storing `currancyCode: ZZZ` against the RWF
> currency) was written during development by a probe that wrongly assumed the mismatched
> pair would be rejected. `GET /pfi` now returns an empty list, so it has since been
> cleared. The lesson stands: a field the API does not validate is not a safeguard, so a
> write probe must make a **required, validated** field invalid.

Nominations verified **read-only** against the live API (15 checks): routing and module
mapping, the backend code confirmed as `NOMINATIONS`, all five `nominations.*` codes, the
five required fields read from the API's own rejection, **both halves of the
`expectedLoadingedDate`/`expectedLoadingDate` split**, the disjoint list/detail shapes, and
**`driverVehicleId` confirmed to be the assignment id** — present among the assignment ids
and absent from the vehicle ids.

The strongest check sent the *exact payload the form builds*, with only the `stockId`
replaced by a non-existent UUID. It returned `409 RELATION_CONFLICT` rather than a
validation error, which proves the shape was accepted and the write failed solely on the
unknown stock. That validation runs first was confirmed separately: the same body with a
malformed date returns `400` instead. The list still held exactly one record afterwards.

Stock verified **read-only** against the live API (18 checks): routing and module mapping,
all five `stock.*` codes, and the four statuses confirmed by rejections on *both* the
status route and create. **No data was created, changed, or deleted:** every write probe
used a deliberately invalid payload, so none could have succeeded.

The create contract was verified before create was withdrawn from the UI — four required
fields, `status` optional, JSON rather than multipart — and is kept in the service's
history only as the basis for the `Stock` response type. The page now exposes the status
change alone.

The list returned no records, so **the response shape remains unverified** — see the note
above.

The nested cargo list verified **read-only** against the live API (14 checks): the list
nesting a full `deport` alongside `order`, both resolving to real records for **every**
row, a `stocks` array present but empty throughout, the detail still returning the flat
ids the edit form binds to, and those ids matching the nesting. The document guard was
verified separately (9 checks) against the real URLs — **its first implementation passed
every case except the malformed one it was written for**, because `new URL()` parses the
concatenated value as a legitimate hostname; checking the raw string fixed it.

The revised cargo contract verified **read-only** against the live API (18 checks):
**`deportId` confirmed required**, **`quantity` confirmed to have replaced
`qtyInKg`/`qtyInLts`**, the seven required fields matching exactly, the optional fields
unchanged, the list nesting `order` while carrying **no deport reference at all**, the
detail returning both ids flat with no nested order, both ids resolving against their own
endpoints, and multipart still enforced. **No data was created, changed, or deleted.**

Cargo verified **read-only** against the live API (25 checks): routing and module mapping,
all five `cargo.*` codes, the list shape, **`orderId` confirmed absent from the list and
present on the detail**, **quantities confirmed to be strings**, the cargo's order
resolving to a real record, **a JSON body confirmed refused with `406`**, all seven
required fields reported from a multipart probe carrying no cargo fields, the two refs and
the document confirmed optional, the three statuses confirmed by the API's own rejection,
and the date round-trip preserving its calendar day. **No data was created, changed, or
deleted.**

Two checks failed first time and caught real problems: the module had been renamed
`NORMINATIONS` → **`NOMINATIONS`** between two reads in the same session, and the
required-field probe was sending **empty strings**, which satisfy the string check and hid
three of the seven fields. Both were corrected and re-verified.

The multipart handling was verified separately by capturing the request off the wire:
axios sets `multipart/form-data` with a `boundary=` parameter for `FormData`, and passing
`Content-Type: undefined` neither helps nor breaks it.

The grouped vehicle picker verified **read-only** against the live API (19 checks, every
driver in the data): each driver offered all active vehicles minus the ones already held,
no already-assigned vehicle ever offered, **the `same`/`other` groups partitioning the
candidates exactly with no overlap or loss**, every group's transporter membership
correct, and — the case that motivated the change — **a driver whose own transporter has
no free trucks still receiving options**. **No data was created, changed, or deleted.**

The assignment display verified **read-only** against the live API (13 checks): the
`vehicles` array present on the list, **the nested key confirmed as `vechile`**, **the
outer id confirmed to be the assignment rather than the vehicle**, the nested vehicle
resolving to a real record, `vehicles` confirmed still absent from the detail endpoint,
the column handling a missing or empty array without crashing, and already-assigned
vehicles excluded from the picker. **No data was created, changed, or deleted.**

Vehicle assignment verified **read-only** against the live API (9 of 10 checks): the
assign route confirmed to exist and answer only to `PUT` (a `409 RELATION_CONFLICT`, not
`ROUTE_NOT_FOUND`), **no vehicle field on the driver list or detail and no driver field on
the vehicle**, and the dialog's candidates correctly scoped to the driver's transporter and
to active vehicles. Only fake ids were sent, so nothing was assigned. The one failure was
a **stale assertion, not a bug** — it expected the `ZZ0000` probe vehicle to still be
inactive, but it had been reactivated between sessions.

Drivers verified **read-only** against the live API (23 checks): routing and module
mapping, all five `drivers.*` codes, the list shape, **the `paassport`/`passport` spelling
split confirmed from both the validation error and the payloads**, `transporterId`
confirmed absent from the list and present on the detail, the status route confirmed to
exist via `RESOURCE_NOT_FOUND` on a nonexistent id, the transporter option surviving both
render windows, and all four licence-guard behaviours. **No data was created, changed, or
deleted** — the write probes used an empty body and a nonexistent id, neither of which can
succeed.

Vehicles verified against the live API (23 checks): routing and module mapping, all five
`vehicles.*` codes, the list shape with its nested `transport` **and** flat
`transporterId`, the detail endpoint swapping that nesting for timestamps, all six fields
confirmed required, the transporter option surviving both render windows, and all four
plate-guard behaviours.

> **This run was not read-only.** One check asserted the API would reject a string
> `tankCapacity`; it does not, so the probe's payload **created a vehicle** (`ZZ0000`).
> There is no delete endpoint, so it was deactivated instead — which incidentally
> verified the status toggle. Probes that could write should use a deliberately invalid
> payload, not a valid one plus an assumption.

Transporters verified **read-only** against the live API (18 checks): routing and module
mapping, all five `transporters.*` codes defined, the flat list shape, **the detail
endpoint adding `updatedAt` that the list omits**, all four fields confirmed required by
the API's own rejection, and all five duplicate-guard behaviours. Two checks initially
failed and caught a real drift — **the backend had renamed `TRANSPORTER` → `TRANSPORTERS`
and `VEHICLE` → `VEHICLES`**, which would have left both unmapped in the sidebar.
**No data was created, changed, or deleted.**

Deports verified **read-only** against the live API (18 checks): routing and module
mapping, all five `deports.*` codes defined, the flat list shape with its three type
values, the detail endpoint matching a list row, all four duplicate-guard behaviours, and
the type constraint confirmed by the API's own rejection naming `local`/`foreign`/
`international`. One check revealed **`type` is optional server-side** — only `name` and
`location` are required. **No data was created, changed, or deleted.**

The two Select/permission fixes verified **read-only** (10 checks): the seeded supplier
and plan keeping a matching option across all three render stages — including **the window
where the value is set but the fetched record is momentarily absent, which is what left
the field blank** — an inactive record staying selectable only when it is the current
value, and a shared query no longer being disabled by an unrelated module's permission.

Order editing verified **read-only** against the live API (18 checks): `GET /orders/:id`
returning a record for **every** existing order, carrying the foreign keys the list omits,
matching its list row, and returning `null` rather than erroring for a stale id; all three
seeded ids resolving against the supplier, plan, and item sources; an order's own supplier
and plan staying selectable regardless of status; and both round-trips holding — the order
date keeping its calendar day through seed and re-submit, and the string `quantity`
converting back to the same number. **No data was created, changed, or deleted.**

The orders list verified **read-only** against the live API (16 checks): the flat array
shape with nested `item`/`supplier`/`createdUser`, **`quantity` confirmed to be a string**,
**nested objects confirmed to carry no ids**, both filters returning correctly-shaped rows
that are a strict subset of the full list, `planId` genuinely narrowing the result, and
both parameter traps confirmed — `orderPlanId` rejected with 404, and the filter endpoint
404ing when given no parameters. **No data was created, changed, or deleted.**

The item cascade verified **read-only** against the live tree (16 checks): the three
levels resolving (`Fuel` → `Petrol` → `PMS`), each level scoped to the choice above it,
**a branch selecting nothing while a leaf sets the value**, switching a level truncating
the path below, a childless Class remaining directly selectable with no empty sub-level,
a stored leaf rebuilding its full ancestor path, and — across every node in the tree —
**no branch id ever reaching the payload**.

Orders verified **read-only** against the live API (17 checks): routing with `/orders` and
`/orders/plans` coexisting, all five `orders.*` codes defined, **the create contract read
from the API's own rejection — exactly five required fields, `createdByUserId` absent**,
the three dropdown sources loading and filtering to active records, date conversion, and
both blockers confirmed (`GET /orders` → 500 with no list route, `GET /orders/:id`
unstable). **No data was created, changed, or deleted.**

Order plans verified **read-only** against the live API (20 + 10 checks): routing and
module mapping, all five `orders.plan.*` codes defined, the flat list shape, **four
statuses confirmed by the API's own rejection message**, and all four duplicate-guard
behaviours. **No data was created, changed, or deleted** — the status probe used an
invalid value, which the API rejects without changing state.

A follow-up run confirmed the API now returns `startDate`/`endDate` **in the list but
still not in the detail**, that the edit form seeds correctly from a list row, and that a
midnight-UTC date keeps its calendar day through the input, the display, and the
round-trip back to an ISO payload.

Permission gating verified **read-only** against the live API (17 checks): all seven
modules confirmed to define their five codes, **`roles.manage` granting read while the
admin demonstrably lacks `roles.read`**, a view-only role getting read without
create/edit/delete, a manage-only role getting all four, a role with no permissions
getting none, mixed grants resolving per action, and — both directions — **module codes
not leaking across a shared prefix** (`suppliers.manage` grants nothing on
`suppliers.type`). **No data was created, changed, or deleted.**

Suppliers verified **read-only** against the live API (20 checks): routing with
`/suppliers` and `/suppliers/types` coexisting, the flat list shape, **the list nesting
`supplierType` while the detail returns a flat `supplierTypeId` plus timestamps**, the
row's type resolving against the types endpoint, and all five duplicate-guard behaviours
(TIN, name, case-insensitivity, self-exclusion, genuinely new) exercised against real
values. **No data was created, changed, or deleted.**

Supplier types verified **read-only** against the live API (12 checks): `SUPPLIERS_TYPE`
present in the module tree and mapped to `/suppliers/types`, every module code still
mapped, routes unique, the flat list shape and its `{ id, type, status }` fields, the
detail endpoint matching the list row, and all four duplicate-guard behaviours exercised
against real values. **No data was created, changed, or deleted.**

Items page verified against the live API (24 checks across two runs): the tree shape
(flat array, `descriptions`, children under `items`, no `parentId`), flattening
reconstructing parentage and depth-first order, the detail endpoint's differing shape,
create round-tripping with `descriptions` and `parentId` and the new child appearing
nested, **update persisting despite returning `data: []`**, the status toggle flipping
and flipping back through the axios client, inactive items still appearing in the list,
`units` confirmed absent from every response, and `VALIDATION_ERROR` on missing required
fields.

Probe items were deactivated afterwards (there is no delete endpoint); the pre-existing
`Fuel`, `Petrol`, `Diesel`, and `item Testing` were left untouched and active.

Unit status verified against the live API (13 checks): the new four-field list shape with
`createdAt` absent, the toggle succeeding through the axios client (proving the
`Content-Type: null` fix), the list reflecting the flip, **a second call flipping it back
— confirming a toggle, not a set** — an unknown id rejected, and the item form excluding
an inactive unit while keeping one it already references. All units were left active.

Units page verified against the live API (9 + 9 checks): routing after the backend's
`UNIT` → `UNITS` rename, every module code still mapped, the flat (non-paginated) list
shape, create and update round-tripping, `VALIDATION_ERROR` on empty fields, and the
duplicate guard — case-insensitive on both name and code, ignoring the row being edited,
and allowing genuinely new units. Probe units were repurposed into real ones afterwards
(there is no delete endpoint).

Status toggle verified against the live API (10 checks): the request succeeding through
the axios client (proving the `Content-Type: null` fix), the response and the list
agreeing on the new state, **a second call flipping it back — confirming it is a toggle,
not a set** — an unknown id returning `RESOURCE_NOT_FOUND`, and the admin account left
untouched. The test user was restored to its original state.

Credential generation verified (13 checks): over 500 samples, every password meets the
8-character minimum, contains all four character classes, excludes ambiguous glyphs, and
is unique; PINs are 6 digits by default, honour 4–8, and are roughly uniform across
`0-9`. End-to-end, **a user created with a generated password successfully signs in**,
a user can be created without `pin` or `phone`, and a 7-character password is rejected by
the API exactly as the form's own rule predicts.

Module deletion verified against the live API (10 checks): delete succeeding through the
axios client (which proves the `Content-Type: null` fix), the module leaving the list,
its permissions going with it, unknown id → `RESOURCE_NOT_FOUND`, and — the finding that
shaped the confirm dialog — **a deleted parent's children surviving and being promoted to
top level rather than cascade-deleted**.

Roles page verified against the live API (17 checks): paginated list unwrapped,
permissions read through the join table, the picker built from `/modules/list` with no
duplicate modules or permission ids and nested paths shown, **a role created with three
permissions attaching exactly those three**, duplicate name → `RESOURCE_CONFLICT`,
unknown permission id → `RELATION_CONFLICT`, delete removing the role, and a fixed role
refusing deletion.

Role editing verified end-to-end against the live API (12 checks): `PUT` with the id in
the path grants new permissions, re-granting an existing one creates no duplicate join
rows, `.manage` can be granted, rename applies and keeps permissions, unknown permission
id → `RELATION_CONFLICT`, and — the findings that shaped the UI — **a subset does not
revoke and `[]` does not clear**.

Permission rules verified (12 checks) after the `.manage` collapse was reverted:
***Select all* sends all five ids including `read`**, ticking `.manage` no longer clears
the individual permissions, ticking an individual no longer drops `.manage`, selection
counts are accurate, and toggling one module never affects another. The same run
confirmed `/roles/assign-permissions` returns **404** while gated `GET /roles` returns
**403**, proving the endpoint is missing rather than blocked.

Test data was removed after every run — only the seeded `Administrator` role remains.

> **The dev API is intermittent.** Runs above hit repeated `502` and Cloudflare `1033`
> outages lasting several minutes. If verification fails wholesale, check the API is up
> before assuming a regression.

**Not verified in a browser:** the rendered screens. The network and store layers are
confirmed end-to-end, but the UI has not been exercised against the live API.
# IKWIM_V2
# IKWIM_V2
# IKWIM_V2
# IKWIM_V2
