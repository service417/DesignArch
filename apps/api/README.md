# DesignArc API

The system of record: a **modular monolith** serving the Admin web app and the
field mobile app over one REST API (`/api/v1`).

## Why the code is shaped this way

The business calls inspection sign-off, price setting/acceptance, and payment
records *business-critical*, and requires that pricing history, inspection photos,
and earnings can never be lost. Three consequences run through the codebase:

1. **The state machine is the law.** [`src/domain/stage-state-machine.ts`](src/domain/stage-state-machine.ts)
   is the single place stage transitions are decided. It is pure, synchronous
   TypeScript — no database, no framework, no clock — so every business rule is
   exhaustively unit-testable. Any transition not declared there cannot happen.

2. **The pricing ledger is append-only.** `pricing_history` is INSERT-only,
   enforced by a Postgres trigger, and the "accepted price" is a *projection* of
   that ledger ([`src/domain/pricing-ledger.ts`](src/domain/pricing-ledger.ts)).
   `stage.accepted_price` is only a read-model; if the two ever disagree, the
   ledger is authoritative and `reconcile()` says so.

3. **The money path is one transaction.** Accepting a price updates the stage,
   appends the ledger, creates the earning, writes the audit row, and queues
   notifications inside a single `$transaction`. It commits or it did not happen.
   This is the reason the architecture chose a monolith over microservices.

Money is always **integer minor units (LKR cents) in `BigInt`** — never a float.
`0.1 + 0.2 !== 0.3`, and this system decides what people are paid.

## Layout

```
src/
├── domain/          Pure business logic — no I/O, fully unit-tested
│   ├── stage-state-machine.ts   the nine-state lifecycle + guards
│   ├── pricing-ledger.ts        append-only ledger projection
│   ├── money.ts                 minor-unit parsing/validation
│   └── stage.types.ts           framework-independent domain types
├── auth/            JWT (rotating refresh + reuse detection), deny-by-default RBAC
├── stages/          The money path: transitions, pricing, settlement
├── notifications/   In-app feed; push queued out-of-band (non-blocking)
├── audit/           Security + sensitive-action trail
└── prisma/          Client lifecycle
prisma/
├── schema.prisma    Tables, enums, relations, indexes
└── constraints.sql  CHECK constraints + triggers Prisma cannot express
```

## Running it

Requires **Node 24+**, **pnpm 10+**, and (for anything touching the database)
**PostgreSQL 18** and **Redis** — `docker compose up -d` at the repo root
provisions both.

```bash
pnpm install
cp .env.example .env                 # then fill in secrets

# Database
pnpm prisma:generate
pnpm migrate:dev                     # create schema
psql "$DATABASE_URL" -f prisma/constraints.sql   # apply triggers + CHECKs
pnpm seed                            # demo users, project, job card

pnpm start:dev                       # http://localhost:3000/api/v1
                                     # OpenAPI at /api/docs (non-production)
```

### Tests

The domain suite needs **no database or network** — it is pure logic:

```bash
pnpm test                 # all specs
pnpm test:cov             # coverage (80% gate on business logic)
```

`src/domain/*.spec.ts` is the **money-path suite** the architecture requires to
pass before any release ships. It asserts rules by ID (BR-3, BR-5, BR-6, BR-9,
FR-5.6…) so a failure names the rule it broke.

## Security posture

- **Deny-by-default RBAC**: a route with neither `@Roles()` nor `@Public()` is
  unreachable. Forgetting to annotate a new endpoint locks it down rather than
  exposing it. Every denial is written to the audit log (FR-1.4).
- **Defence in depth**: the route annotation is the outer gate; the state machine
  independently re-checks role *and* assignment, and the database re-checks with
  CHECK constraints and triggers. A bug in any one layer does not break a rule.
- **bcrypt cost 12**; login compares against a dummy hash on unknown emails so
  response time does not reveal which addresses are registered.
- **Rotating refresh tokens with reuse detection** — replaying a rotated token
  revokes the whole session family.
- JWT `validate()` re-reads the account every request, so deactivating a user
  takes effect immediately rather than at token expiry.

## Status

Built: domain core (state machine, ledger, money) with full unit tests; Prisma
schema + database constraints; auth/RBAC/audit; the stage workflow and money
path; notification fan-out.

Not yet built: projects/job-cards/users CRUD controllers, media upload with
signed URLs, the dashboard and monthly PDF reports, and the BullMQ workers for
push and PDF. Endpoint shapes for these are specified in
[`docs/Solution-Architecture-Blueprint.txt`](../../docs/Solution-Architecture-Blueprint.txt) §7.2.
