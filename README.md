# Shift App — Backend

NestJS + Prisma + PostgreSQL + Redis + BullMQ. This is the foundation: RBAC core
and the Scheduling module, wired end-to-end so you can verify the permission
system works before building out the rest.

## What's here

- `prisma/schema.prisma` — full data model (RBAC, scheduling, time & attendance, audit log)
- `prisma/seed.ts` — creates a demo org with Owner/Admin/Manager/Employee roles and default permissions
- `src/common/services/permission.service.ts` — the `can()` gate, Redis-cached
- `src/common/guards/permission.guard.ts` — enforces `@RequirePermission()` on routes, writes audit log
- `src/modules/scheduling/` — first working module: list/create/publish shifts, permission-gated

## What's NOT here yet (build next, one module per session)

- Auth module (JWT login/signup) — the permission guard currently expects `req.user` to already be populated; wire this up next
- Time & Attendance module (clock in/out, offline sync endpoint)
- Messaging module (the BullMQ worker that actually sends push/email/SMS)
- Multi-tenant middleware to resolve `req.orgId` from the authenticated user's context

## Stack — 100% free & open source

Every piece here is MIT/Apache/BSD/PostgreSQL-licensed and free to self-host:
NestJS, Prisma, PostgreSQL, BullMQ, Socket.io. The one asterisk: Redis itself
changed its license in 2024 to a source-available model. This project uses
**Valkey** instead — the Linux Foundation's open-source, BSD-licensed fork.
Valkey speaks the identical wire protocol, so `ioredis` and `@nestjs/bullmq`
work against it with zero code changes — only the Docker image differs.

## Setup

**Fastest path — Docker (Postgres + Valkey, one command):**

```bash
docker compose up -d
npm install
cp .env.example .env    # defaults already match docker-compose.yml
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

**Without Docker:** install Postgres 16+ and Valkey (or Redis, same protocol)
locally, then follow the same steps from `npm install` onward, adjusting
`.env` to match your local connection details.

Stop everything: `docker compose down` (add `-v` to also wipe the data volumes).

## Try it

Once seeded, `GET /locations/:locationId/shifts` will 403 until a `UserRole` row
exists linking your test user to the seeded Manager role at that location's org —
that's the RBAC system working as designed. Insert that row manually via
`npx prisma studio` to test the happy path before Auth is wired up.

## Design notes carried over from planning

- Never check `user.role` in business logic — always go through `PermissionService.can()`
- Owner/Admin get every permission directly (no inheritance graph) — simplest thing that works
- Notification fan-out always goes through the BullMQ queue, never a synchronous loop
- `created_via` / `synced_at` on `TimeEntry` exist specifically to support the offline-first mobile clock-in flow — implement that sync-conflict endpoint carefully when you get to the Time & Attendance module
