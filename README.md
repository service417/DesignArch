# DesignArc — Furniture Manufacturing Workflow Platform

A workflow platform that digitises how DesignArc coordinates furniture work — from a
**Project → Job Card → Stage** (Carpentry, then optional Painting), through Supervisor
inspection, post-inspection pricing, worker accept/decline, and payment recording.

Built by QueMore against the **SRS Rev 1.1** (ISO/IEC/IEEE 29148:2018) and the
**Solution Architecture & Design Blueprint**. Both source documents (and their extracted
text) live in [`docs/`](docs/); UI reference mockups are in [`reference/`](reference/).

## Why this design

The defining requirement is **workflow integrity**, not scale. Inspection sign-off,
price setting/acceptance, and payment records are business-critical: pricing history,
inspection photos, and earnings must never be lost. Every architectural decision follows
from that — a strongly-consistent relational core, an **append-only pricing ledger**, a
**server-enforced stage state machine**, and **RBAC on every endpoint**.

Three-way separation of duties on the money path: **Admin** prices & pays, **Supervisor**
inspects, **Worker** accepts. No single role can invent, approve, and pay for work alone.

## Architecture

A **modular monolith** (single deployable, cleanly bounded modules) — not microservices.
At ~200 concurrent users on a single tenant, a monolith gives ACID transactions across the
`inspection → price → earning` path for free, which is exactly the integrity the SRS demands.

| Layer        | Choice                                            |
|--------------|---------------------------------------------------|
| API          | NestJS on Node 24 LTS (TypeScript), REST `/api/v1`|
| Database     | PostgreSQL 18 (Prisma ORM)                        |
| Cache / queue| Redis 7 + BullMQ (async notifications, PDF, thumbs)|
| Storage      | S3-compatible object storage, signed URLs         |
| Admin web    | React 18 + TypeScript + Vite *(planned)*          |
| Mobile       | Flutter — iOS + Android *(planned)*               |

## Monorepo layout

```
DesignArch/
├── apps/
│   └── api/          NestJS backend — the system of record (built)
│                     (apps/web and apps/mobile to follow)
├── packages/         shared types / config (as needed)
├── docs/             SRS + Architecture blueprint (source of truth)
└── reference/        UI mockups
```

## Current status

**Backend foundation** is the first vertical (see [apps/api/README.md](apps/api/README.md)):
the full Prisma schema encoding the DB design, the pure-TypeScript **stage state machine**
and **pricing engine** (unit-tested), and Auth/RBAC + module scaffolds. The Admin web and
Flutter mobile apps are planned next verticals — their toolchains are not yet set up on this
machine, and both depend on this backend.

## Getting started

Requires **Node 24+** and **pnpm 10+**. PostgreSQL 18 + Redis are needed to run the full
API (a `docker-compose.yml` provisions both); the pure-domain unit tests run with no services.

```bash
pnpm install
pnpm --filter @designarc/api test      # run domain + unit tests
pnpm --filter @designarc/api build     # typecheck + compile
```

See [apps/api/README.md](apps/api/README.md) for the full run guide.
