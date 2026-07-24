# Code best practices

Standards for writing and reviewing HRMS code. These align with ESLint/Prettier in the repo and with [SERVER-ARCHITECTURE.md](./architecture/SERVER-ARCHITECTURE.md) / [API-HTTP-ERRORS.md](./architecture/API-HTTP-ERRORS.md) for APIs.

---

## Control flow

### Always use blocks for `if` / `else`

ESLint enforces `curly: "error"`. Every branch must use braces, even for a single line. The same applies if you must use a `for` / `while` loop (see [Variables and immutability](#variables-and-immutability)).

```typescript
// Good
if (!parsed.success) {
  sendHttpResult(res, httpValidationErrorFromZod(parsed.error))
  return
}

// Bad
if (!parsed.success)
  return sendHttpResult(res, httpValidationErrorFromZod(parsed.error))
```

### Prefer early `return`

Handle errors and edge cases first, then keep the happy path unindented. Avoid `else` after `return` (`no-else-return` is enabled).

```typescript
// Good
if (isHttpErrorResult(scope)) {
  sendHttpResult(res, scope)
  return
}

const result = await leaveService.createLeave(command)
sendHttpResult(res, result)

// Avoid
if (isHttpErrorResult(scope)) {
  sendHttpResult(res, scope)
} else {
  const result = await leaveService.createLeave(command)
  sendHttpResult(res, result)
}
```

### Equality

- Use `===` / `!==` only (`eqeqeq`).
- Never `var` (`no-var`).

---

## Variables and immutability

### Prefer `const` over `let`

Use **`const` by default** for every binding that is not reassigned.

```typescript
// Good
const users = await findUsers(query)
const activeUsers = users.filter((u) => u.isActive)
const totalDays = leaves.reduce((sum, leave) => sum + leave.days, 0)

// let — only when you must reassign (rare)
let retryCount = 0
const result = await fetchWithRetry(url, {
  onRetry: () => {
    retryCount += 1
  },
})
```

Use **`let` only** when a variable must be reassigned. If you reach for `let`, check whether `map` / `reduce` / a helper can express the same logic without mutation.

### Do not mutate objects or arrays

Treat data as **immutable**. Return new values instead of changing existing ones.

```typescript
// Bad — mutates input
function addRole(user: User, role: string) {
  user.roles.push(role)
  return user
}

// Good — new object/array
function addRole(user: User, role: string): User {
  return {
    ...user,
    roles: [...user.roles, role],
  }
}
```

```typescript
// Bad
items.sort()
items.push(newItem)

// Good
const sorted = [...items].sort(compareFn)
const nextItems = [...items, newItem]
```

**Avoid:** `push`, `pop`, `shift`, `unshift`, `splice`, `sort` (in place), `reverse` (in place), direct property assignment on shared objects (`obj.field = x`), and `delete obj.field` when the object is passed in or stored in state.

**React state:** always pass a new reference to setters (`setItems([...items, x])`, functional updates `setItems((prev) => [...prev, x])`).

### Prefer array methods over `for` / `while`

Use **`map`**, **`filter`**, **`reduce`**, **`find`**, **`some`**, **`every`**, **`flatMap`**, and **`Object.entries` / `Object.fromEntries`** instead of `for`, `for...of`, `for...in`, or `while`.

```typescript
// Bad
const names: string[] = []
for (let i = 0; i < users.length; i++) {
  if (users[i].isActive) {
    names.push(users[i].name)
  }
}

// Good
const names = users.filter((u) => u.isActive).map((u) => u.name)
```

```typescript
// Bad
let total = 0
for (const line of lines) {
  total += line.amount
}

// Good
const total = lines.reduce((sum, line) => sum + line.amount, 0)
```

```typescript
// Good — build a lookup without mutation
const byId = Object.fromEntries(users.map((u) => [u.id, u]))
```

### When imperative loops are acceptable

Use `for` / `while` only when array methods are genuinely awkward **and** document why in a short comment, for example:

- Early exit over a very large stream where performance is measured and critical
- Interop with a non-array iterator API
- `break` / `continue` logic that would be harder to read as nested `reduce`

Even then, prefer **`for...of`** over indexed `for` and do not mutate external state inside the loop body if avoidable.

### `forEach` vs `map`

- Use **`map`** when you need a transformed array.
- Use **`filter`** / **`reduce`** for aggregations and predicates.
- **`forEach`** is for side effects only (e.g. logging); do not use it to build a new array — use `map` instead.

---

## Dates and times

Use **`@/utilities/helpers/date-time`** for all runtime date math and formatting. Do not scatter raw `new Date()` / `setDate` / `toISOString().slice(0, 10)` across services unless you are inside the date-time module itself.

| Need                                  | Use                                                        |
| ------------------------------------- | ---------------------------------------------------------- |
| Current timestamp                     | `getRawDate()`                                             |
| Format a date                         | `getFormattedDate(date, DATE_TIME_FORMATS.DEFAULT_FORMAT)` |
| Date-only UTC midnight (`YYYY-MM-DD`) | `parseDateOnlyToUtc(date)`                                 |
| Calendar day in a timezone            | `dayBoundsInTimezone(date, timeZone)`                      |
| Date + `HH:mm` in a timezone          | `combineDateAndTimeInTimezone(date, time24, timeZone)`     |
| Format date in timezone               | `formatDateInTimezone(date, timeZone)`                     |
| Inclusive date-only range             | `enumerateDateRange(from, to)`                             |
| Add days / minutes                    | `addDaysToDate(date, n)`, `addMinutesToDate(date, n)`      |
| Elapsed minutes                       | `getMinutesBetween(start, end)`                            |
| Compare dates                         | `isBeforeDate`, `isAfterDate`, `isSameDate`                |
| Start/end of day                      | `getStartOfDay`, `getEndOfDay`, `getStartOfToday`          |

```typescript
// Bad — ad-hoc date construction in a service
const now = new Date()
const graceEnd = new Date(scheduledStart.getTime() + graceMinutes * 60000)
const dateKey = occurredAt.toISOString().slice(0, 10)

// Good — shared utilities
const now = getRawDate()
const graceEnd = addMinutesToDate(scheduledStart, graceMinutes)
const dateKey = getFormattedDate(occurredAt, DATE_TIME_FORMATS.DEFAULT_FORMAT)
```

**Timezone-aware calendar days** and **date-only ranges** live in `@/utilities/helpers/date-time` (`dayBoundsInTimezone`, `combineDateAndTimeInTimezone`, `formatDateInTimezone`, `enumerateDateRange`, `parseDateOnlyToUtc`). Import from there — not from attendance helpers.

Use **`typeof x === 'number'`**, **`x != null`**, or a **type predicate** (`value is T`) to narrow optional fields — not `!== null` alone when the type is `T | undefined`.

### Avoid non-null assertions (`!`)

Do not use TypeScript's postfix `!` to silence possibly-undefined values. Narrow first, or restructure so the type is guaranteed (e.g. pass required params after a guard).

```typescript
// Bad
const type = log.metadata!.violationType!
const range = enumerateDateRange(command.from!, command.to!)

// Good — flatMap skips logs without violation metadata
const violations = logs.flatMap((log) => {
  const violationType = log.metadata?.violationType
  if (!violationType) {
    return []
  }
  return [{ type: violationType, reason: log.metadata?.reason ?? '', ... }]
})

// Good — explicit range resolution after validation
if (command.from && command.to) {
  return enumerateDateRange(command.from, command.to)
}
```

---

## Imports

### Order (top to bottom)

1. **External packages** — `react`, `next`, `mongoose`, `@tanstack/react-query`, etc.
2. **`@/` project aliases** — constants, types, schemas, server utilities, hooks, components.
3. **Relative imports** — `../`, `./` (use sparingly; prefer `@/` when a path alias exists).

Separate groups with a blank line. Sort alphabetically within each group when practical.

```typescript
import React from 'react'
import { useMutation } from '@tanstack/react-query'

import { API_ERROR_CODE } from '@/constants/apiErrorCodes'
import type { NoteType } from '@/schemas/noteSchema'
import { fetchWrapper } from '@/utilities/helpers/fetchWrapper'

import { helper } from './helper'
```

### Type-only imports

Use `import type { ... }` for types and interfaces so they are erased at compile time.

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import type { HttpResult } from '@/server/application/types/httpResult'
```

### React hooks

Do **not** import hooks as named exports from `'react'`. Use the namespace (ESLint `no-restricted-imports`):

```typescript
// Good
import React from 'react'

const [value, setValue] = React.useState('')

// Bad
import { useState } from 'react'
```

Exception: files under `**/ui/**` may use named hook imports.

### Avoid

- Unused imports (fix or prefix intentional unused args with `_`).
- Cross-domain imports of `server/services/<otherDomain>/helpers/` — helpers are private to their domain.

---

## Formatting

Prettier (`.prettierrc`) is the source of truth:

- Single quotes
- No semicolons
- Trailing commas ES5-style
- Print width 80

Run before commit:

```bash
npm run format
npm run lint
npm run type-check
```

---

## API errors and responses

### Use stable error codes

Clients and logs should rely on **`code`**, not parsed HTTP status text or English `message` alone.

- Define codes in [`constants/apiErrorCodes.ts`](../constants/apiErrorCodes.ts) as `API_ERROR_CODE.*`.
- Add a new constant when introducing a new error class clients must handle.
- Pass codes through `httpError({ code: API_ERROR_CODE.*, ... })`.

```typescript
import { API_ERROR_CODE } from '@/constants/apiErrorCodes'
import { httpError } from '@/server/utils/httpResponse'

return httpError({
  statusCode: 403,
  code: API_ERROR_CODE.ORGANIZATION_MISMATCH,
  message: 'User belongs to another organization',
})
```

### Error response body shape

Errors returned to the client use `ApiErrorBody`:

| Field     | Required | Purpose                                     |
| --------- | -------- | ------------------------------------------- |
| `code`    | Yes      | Stable machine-readable identifier          |
| `message` | Yes      | Human-readable summary (may change copy)    |
| `details` | No       | Structured payload (e.g. Zod `fieldErrors`) |
| `reasons` | No       | List of validation or business reasons      |

Example:

```json
{
  "code": "REQUEST_VALIDATION_FAILED",
  "message": "Validation failed",
  "details": {
    "fieldErrors": { "startDate": ["Required"] },
    "formErrors": []
  }
}
```

### Success response body shape

Success responses use an envelope:

```json
{
  "data": {},
  "meta": { "operation": "leave.created" }
}
```

Build successes with `httpSuccess(data, operationMeta('leave.created'), 201)` and include a clear `operation` string for tracing.

### `HttpResult` in server code

Services and controllers return a discriminated result — do not throw for expected 4xx/422 in new code.

| Shape                                                     | Meaning |
| --------------------------------------------------------- | ------- |
| `{ ok: true, statusCode, body: { data, meta } }`          | Success |
| `{ ok: false, statusCode, body: { code, message, ... } }` | Error   |

Helpers:

- `httpError`, `httpSuccess`, `httpValidationErrorFromZod`, `httpUnauthenticated`, `httpForbidden`, `httpNotFound`
- `isHttpErrorResult(result)` — narrow before reading `body`
- `sendHttpResult(res, result)` — write to `NextApiResponse` in controllers

```typescript
if (isHttpErrorResult(scope)) {
  sendHttpResult(res, scope)
  return
}

const result = await leaveService.createLeave(command)
sendHttpResult(res, result)
```

### Where errors are decided

| Status    | Layer                  | Notes                              |
| --------- | ---------------------- | ---------------------------------- |
| 400       | Controller             | Zod / param validation             |
| 401       | Controller / route     | Session missing                    |
| 403       | Controller             | Permissions, org scope             |
| 404       | Controller (preferred) | Missing resource before mutate     |
| 409 / 422 | Service                | Only when domain state requires DB |
| 500       | `methodHandler`        | Unexpected exceptions              |

Do not parse `req.body` with Zod inside services. See [SERVER-ARCHITECTURE.md](./architecture/SERVER-ARCHITECTURE.md).

---

## API design: use-case commands (not CRUD)

**Policy:** New workflow APIs are **use-case commands**, not generic create/update/delete on collections. **All business logic lives in backend services.** The client sends intent; it does not orchestrate state.

### Writes = verbs, not remote database edits

| Prefer                               | Avoid                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| `POST /api/leaves/submit`            | `PATCH /api/leaves/:id` with `{ status }`                       |
| `POST /api/approvals/:id/approve`    | Body with `approvalStage`, `managerDecision`, `nextRequesteeId` |
| `leaveServices.submitLeave(command)` | `updateLeave` that inspects arbitrary PATCH fields              |
| `SubmitLeaveCommand` (typed)         | Passing a full `Leave` document into a service                  |

**Reads** (`GET` lists, detail, reports) may stay resource-shaped. The problem is **using CRUD writes as a substitute for missing backend workflows**.

### Thin client, thick server

- **Session** supplies `organizationId` and actor — never from client body.
- **Services** own quotas, approver resolution, state transitions, notifications, and side effects.
- **Controllers** only gate 4xx and map validated HTTP input → command DTO.
- **UI** calls one endpoint per user action; no branching that duplicates server rules.

### Request body rules

Include only what the user explicitly chose (dates, leave type, reason, comment). **Never** expose internal workflow fields on write APIs.

```typescript
// Good — submit intent
{ leaveTypeId, startDate, endDate, reason }

// Bad — client drives state machine
{ status: 'approved', approvalStage: 2, managerDecision: 'approved' }
```

### Naming and operations

| Artifact         | Convention                     | Example                         |
| ---------------- | ------------------------------ | ------------------------------- |
| Route            | `/api/<domain>/<verb>`         | `/api/attendance/check-in`      |
| Service method   | verb + resource                | `submitLeave`, `approveRequest` |
| Command          | `<Verb><Entity>Command`        | `SubmitLeaveCommand`            |
| `meta.operation` | `<domain>.<past-tense-action>` | `leave.submitted`               |

Use `create` / `update` / `delete` on **new** APIs only for **admin catalog** maintenance (permissions, route config, leave types) where there is no approval workflow. Operational modules (leaves, WFH, OPD, attendance, payroll, reimbursements) use **command routes** in new work and when refactoring legacy endpoints (Phases 4–7).

### Legacy

Existing REST-style writes on `/api/leaves`, `/api/opds`, `/api/work-from-home`, etc. remain until their phase refactors them. **Do not add new workflow endpoints in CRUD shape.**

See [SERVER-ARCHITECTURE.md](./architecture/SERVER-ARCHITECTURE.md) §7 and [ALWAYS-APPLY-RULES.md](./agent/ALWAYS-APPLY-RULES.md) §1.

### Adding a new error code

1. Add to `API_ERROR_CODE` in `constants/apiErrorCodes.ts`.
2. Use it in `httpError({ code: API_ERROR_CODE.YOUR_CODE, statusCode, message })`.
3. Document in [API-HTTP-ERRORS.md](./architecture/API-HTTP-ERRORS.md) if it is part of a public contract.
4. On the client, branch on `code` when UX depends on the error type.

---

## Client-side error handling

### Prefer `code` over `message` for logic

```typescript
// Good — stable
if (body?.code === 'ORGANIZATION_MISMATCH') {
  showOrgMismatchUI()
}

// Avoid — fragile
if (body?.message?.includes('another organization')) {
  showOrgMismatchUI()
}
```

Use `message` (and `details.fieldErrors`) for display only.

### Forms and UI error state

- Keep **field-level** errors from `details.fieldErrors` (validation).
- Keep **global** errors from `code` + `message` (auth, forbidden, not found).
- Surface 401 via existing session handling in `fetchWrapper` (redirect to sign-in).
- Do not rely on thrown generic `Error` strings for branching when the API returns a structured body — parse `response.json()` and read `code` where possible.

### Hooks and mutations

- Use TanStack Query `onError` for toasts and logging.
- Invalidate or update cache in `onSuccess` with the correct `queryKey`.
- Throw from the fetch function only when the API does not return a parseable error body.

---

## TypeScript

- **`any` is disallowed** in `.ts` / `.tsx` (`@typescript-eslint/no-explicit-any`).
- Prefix intentionally unused variables/parameters with `_`.
- Prefer shared types from `schemas/` and `types/` over inline duplicates.
- Use command DTOs in `server/services/<domain>/types/commands.ts` for service inputs.

---

## Server layout (new code)

```text
pages/api/<route>/index.ts          → methodHandler, permissions
server/controllers/<domain>/        → 4xx gate, validators, sendHttpResult
server/services/<domain>/           → domain logic, HttpResult
```

- Validators: `server/controllers/<domain>/validators/*Schema.ts`
- Do **not** add new files under `server/services/handlers/`.

PR checklist: [ARCHITECTURE-COMPLIANCE.md](./migration/ARCHITECTURE-COMPLIANCE.md).

---

## Logging and debugging

- **`console.log` is not allowed** (ESLint). Use `console.info` or `console.error` when necessary.
- Do not log secrets, tokens, or full PII.
- Remove temporary debug logs before merge.

---

## Naming

### Files and symbols

| Item                              | Convention                             | Example                                         |
| --------------------------------- | -------------------------------------- | ----------------------------------------------- |
| Files (components)                | PascalCase                             | `LeaveRequestForm.tsx`                          |
| Files (utils, hooks)              | camelCase                              | `fetchWrapper.ts`, `useCreateNote.ts`           |
| Folders (controllers)             | `<domain>Controllers`                  | `opdControllers/`, `leaveControllers/`          |
| Folders (services)                | `<domain>Services`                     | `opdServices/`, `leaveServices/`                |
| Action files                      | camelCase verb + resource              | `getAllOpds.ts`, `createLeave.ts`               |
| Barrel index                      | `index.ts`                             | exports `opdControllers` / `opdServices` object |
| React components                  | PascalCase                             | `function LeaveTable()`                         |
| Functions / hooks                 | camelCase                              | `createLeave`, `useCreateNote`                  |
| Constants                         | `SCREAMING_SNAKE` or `as const` object | `API_ERROR_CODE`                                |
| Zod schemas                       | `*Schema`                              | `createLeaveRequestSchema`                      |
| API operations (`meta.operation`) | dot-separated                          | `leave.created`, `user.passwordUpdated`         |

### Function prefixes (server and shared utils)

Use a **verb prefix** that describes what the function does. Names must be readable without migration or architecture context.

| Prefix / pattern | Use for                                                                             | Examples                                                          |
| ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `get`            | Read or resolve data (including “required” reads that may return `HttpErrorResult`) | `getSessionOrganizationId`, `getAllLeaves`, `getOpdsByUser`       |
| `find`           | Optional lookup that may return `null` / `undefined`                                | `findSessionOrganizationId`                                       |
| `create`         | Insert a new resource                                                               | `createLeave`, `createOpd`                                        |
| `update`         | Change an existing resource                                                         | `updateLeave`, `updateOpd`                                        |
| `delete`         | Remove or soft-delete a resource                                                    | `deleteLeave`, `deleteOpd`                                        |
| `post`           | Rare; prefer `create` unless mirroring HTTP POST semantics in a thin wrapper        | —                                                                 |
| `verify`         | Multi-step validation that returns an error object or `null` (not a bare boolean)   | `verifyRequestOrganization`, `verifyPermissions`                  |
| `is`             | **Boolean** predicate or type guard (quick true/false check)                        | `isHttpErrorResult`, `isSessionOrganizationError`, `isValidEmail` |
| `has`            | Boolean possession check                                                            | `hasRouteAccess`                                                  |
| `can`            | Boolean capability check                                                            | `canApproveLeave`                                                 |

**Avoid**

- `require*` for data fetches — use `get*` (e.g. `getSessionOrganizationId`, not `requireSessionOrganizationId`).
- Phase or implementation jargon in permanent names — e.g. prefer `createOpd` over `createOpdScoped`. Organization checks belong in the controller layer by default; the name should describe the **resource action**, not how tenancy is enforced.
- Vague suffixes (`Scoped`, `Handler`, `Helper`, `Util`) unless they disambiguate two layers (e.g. import alias `createLeaveHandler` for a legacy passthrough).

### Descriptive names

- Prefer **resource + action**: `getLeavesByUser`, `deactivateEmployeeRelationship`.
- Name return-value unions explicitly when exported (`SessionOrganizationIdResult`).
- Type guards for those unions start with `is`: `isSessionOrganizationError`.

### Domain folders: one action per file + barrel index

Each domain gets a **plural folder** under `controllers/` and `services/`. The folder name carries the layer (`opdControllers`, `opdServices`). Individual files are named after the **action only** (no `Controller` / `Service` suffix on functions).

```
server/
  controllers/opdControllers/
    createOpd.ts          → export async function createOpd(...)
    getAllOpds.ts         → export async function getAllOpds(...)
    index.ts              → export const opdControllers = { createOpd, getAllOpds, ... }
  services/opdServices/
    createOpd.ts          → export async function createOpd(...)
    getAllOpds.ts         → export async function getAllOpds(...)
    index.ts              → export const opdServices = { createOpd, getAllOpds, ... }
```

| Layer      | Folder            | File            | Function export | Consumer import                                                        |
| ---------- | ----------------- | --------------- | --------------- | ---------------------------------------------------------------------- |
| Controller | `opdControllers/` | `getAllOpds.ts` | `getAllOpds`    | `import { opdControllers } from '@/server/controllers/opdControllers'` |
| Service    | `opdServices/`    | `getAllOpds.ts` | `getAllOpds`    | `import { opdServices } from '@/server/services/opdServices'`          |
| Route      | `pages/api/opds/` | `index.ts`      | `getHandler`    | calls `opdControllers.getAllOpds(...)`                                 |

**Rules**

- **Folder** name includes the layer: `opdControllers`, `leaveServices`, `workFromHomeControllers`.
- **File** name = action: `getAllOpds.ts`, `deleteOpd.ts`.
- **Function** name = action only: `getAllOpds`, `createLeave` — never `getAllOpdsController`.
- **`index.ts`** imports each action and exports **only** the barrel object (`opdControllers`, `opdServices`). Do not use `export { x } from './x'` or `export type { T } from './types'` in barrel files — import types and functions from their source modules directly.
- Controllers call `opdServices.getAllOpds`; routes call `opdControllers.getAllOpds`.

```typescript
// pages/api/opds/index.ts
import { opdControllers } from '@/server/controllers/opdControllers'

const result = await opdControllers.getAllOpds(organizationId)

// server/controllers/opdControllers/getAllOpds.ts
import { opdServices } from '@/server/services/opdServices'

const allOpds = await opdServices.getAllOpds(organizationId)
```

**Avoid**

- `Controller` / `Service` suffix on **function** names
- `import * as OPDs` or shortened collection aliases
- `import { x as xHandler }` — use the barrel object instead
- Flat `server/services/handlers/<domain>.ts` for new code
- Multiple unrelated actions in one controller/service file
- Re-export chains in `index.ts` (`export { fn } from './fn'`, `export type { T } from './types'`, `export * from`)

### Examples (session and controllers)

```typescript
// Good — get prefix; is* for the error check
const organizationId = await getSessionOrganizationId(req, res)
if (isSessionOrganizationError(organizationId)) {
  return sendHttpResult(res, organizationId)
}

// Good — action name only; folder carries the layer
export async function createOpd(req, res, body) {
  const created = await opdServices.createOpd(parsed)
  ...
}

// Avoid
export async function createOpdController(...) { ... }
export async function createOpdScoped(...) { ... }
import { createWorkFromHome as createWorkFromHomeHandler } from '...'
```

See [SERVER-ARCHITECTURE.md](./architecture/SERVER-ARCHITECTURE.md) for folder layout and migration policy.

---

## Quick review checklist

- [ ] All `if` / `else` use `{ }` blocks
- [ ] `const` by default; `let` only when reassignment is required
- [ ] No in-place mutation of objects/arrays; spread/copy for updates
- [ ] Dates/times use `utilities/helpers/date-time` (not raw `new Date()` in services)
- [ ] No non-null assertions (`!`); optional fields narrowed with guards or type predicates
- [ ] `map` / `filter` / `reduce` (etc.) instead of `for` / `while` where practical
- [ ] Early returns; no unnecessary `else`
- [ ] Imports ordered: external → `@/` → relative; `import type` for types
- [ ] React hooks via `React.useState` (except `ui/`)
- [ ] API errors use `API_ERROR_CODE` and `httpError` / `sendHttpResult`
- [ ] Success responses include `data` + `meta.operation`
- [ ] 4xx resolved in controller before calling service
- [ ] New **write** APIs are use-case commands (verb routes + command DTO); no workflow fields in client body
- [ ] Function names use `get` / `create` / `update` / `delete` / `is` conventions above
- [ ] Controllers/services use `<domain>Controllers` / `<domain>Services` folders; consumers import barrel object; functions have no `Controller`/`Service` suffix
- [ ] No `any`, no `console.log`, Prettier/lint/type-check pass

---

## Related documentation

- [API-HTTP-ERRORS.md](./architecture/API-HTTP-ERRORS.md) — HTTP status and error modules
- [SERVER-ARCHITECTURE.md](./architecture/SERVER-ARCHITECTURE.md) — controller vs service responsibilities
- [ARCHITECTURE-COMPLIANCE.md](./migration/ARCHITECTURE-COMPLIANCE.md) — PR checklist for new domains
- [BRANCHING-STRATEGY.md](./BRANCHING-STRATEGY.md) — how we ship code
