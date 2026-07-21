# Decisions log

Resolutions for the five TBDs the SRS left open, plus the design challenges the
architecture blueprint raised. Each records what was decided, why, and where the
decision is encoded in the codebase — so a future change knows what it is
overturning.

These are the blueprint's recommended defaults, adopted so the build is not
blocked. **All five still need formal confirmation from DesignArc.**

---

## TBD-01 — Technology stack & hosting

**Decided:** NestJS (Node 24 LTS) + PostgreSQL 18 + Redis 7 + S3-compatible
object storage; React + TypeScript admin web; Flutter mobile. Modular monolith,
containerised, single cloud provider.

**Why:** The critical requirement is transactional integrity of the
`inspection → price → earning` path. A monolith gives that in one ACID
transaction; microservices would force distributed coordination and reintroduce
exactly the partial-record risk the SRS forbids — at 200 concurrent users and a
single tenant, for no upside.

**Encoded in:** `apps/api/` structure, `docker-compose.yml`.

---

## TBD-02 — Currency & locale

**Decided:** Single-currency **LKR**, stored as **integer minor units (cents) in
`BigInt`**. Timestamps stored UTC (`timestamptz`), displayed `Asia/Colombo`.

**Why:** Multi-currency is a costly generalisation with no present business
need. Integer minor units because floating-point cannot represent money exactly
(`0.1 + 0.2 !== 0.3`) and this system determines what people are paid.

**Encoded in:** `src/domain/money.ts`, `BigInt` columns in `schema.prisma`, and
the `BigInt.toJSON` override in `src/main.ts` that serialises amounts as strings
so they never round-trip through a JavaScript float.

---

## TBD-03 — Separate Finance role

**Decided:** Deferred to v2.0. Admin retains both pricing and payment-marking
authority for MVP.

**Why:** Acceptable at current team size, but it *is* a separation-of-duties
weakness (blueprint challenge C5): the same role both sets a price and marks it
paid. Permissions are therefore structured so a Finance role can be split out
without refactoring — payment actions are already distinct from pricing actions.

**Encoded in:** distinct `STAGE_PROPOSE_PRICE` / earning-payment paths; the RBAC
guard takes a role list per route, so splitting means changing annotations, not
logic.

---

## TBD-04 — Retention period

**Decided:** **7 years** for financial records (earnings, pricing history) and
inspection photos, aligned to typical tax retention. Confirm with DesignArc/legal.

**Why:** Reconciles the data-protection erasure right against the legal retention
duty: erasure requests run through a governed job that anonymises personal data
while preserving the financial history the law requires.

**Encoded in:** soft-delete columns (`deleted_at`) on `user` and `project`;
`ON DELETE RESTRICT` on all money/evidence foreign keys. The retention job itself
is **not yet built**.

---

## TBD-05 — Photo count & size

**Decided:** Maximum **10 photos per inspection, 5 MB each**, JPEG/PNG/HEIC,
validated server-side by magic bytes rather than by the declared content type.

**Why:** Matches the NFR-P.5 performance target (10 photos uploaded within 15s
p95 on 4G).

**Encoded in:** `MAX_INSPECTION_PHOTOS` / `MAX_PHOTO_BYTES` in `.env.example`,
enforced by `MediaService` and unit-tested in `media/image-type.spec.ts`. Both
limits are re-checked in the service rather than trusted to Multer's, so the rule
holds however a file arrives.

**Also decided — evidence is captured during inspection only.** Photographs may
be added solely while a stage is `READY_FOR_INSPECTION`. Allowing them after
approval would let the evidence record be furnished after the fact, which is the
precise tampering the trail exists to prevent. There is no delete endpoint
(see C4).

---

## C1 — Multi-supervisor from day one

**Decided:** Supervisor is a role many users can hold, not a single named person.
"One on duty" is an operational choice, not a schema limit.

**Why:** ASM-04 ("one Supervisor inspects both stages") would make one person a
floor-wide bottleneck and a single point of failure. Modelling it as a role costs
nothing now and avoids a schema migration later.

**Encoded in:** `NotificationsService.resolveRecipients` fans "ready for
inspection" out to *all* active supervisors, not to one configured user.

---

## C2 — Connectivity

**Decided:** Not offline-first, but hardened against intermittent connectivity:
resumable/queued uploads, client-side compression, idempotent state-changing
actions.

**Why:** ASM-03 ("reliable internet at the workshop") is optimistic for a
workshop floor. A dropped connection should delay an inspection, never lose one.

**Encoded in:** `Idempotency-Key` header accepted on stage actions; optimistic
locking via `stage.version`. **Idempotency replay storage is not yet implemented**
— the header is accepted but not yet deduplicated.

---

## C4 — Deletion semantics

**Decided:** Soft-delete is the default for `user` and `project`. Pricing
history, inspection photos, and earnings are strictly immutable and retained.
Hard delete only via a governed erasure process.

**Encoded in:** `deleted_at` columns; the `pricing_history` append-only trigger
and the `earning` immutability trigger in `prisma/constraints.sql`; a
`project_delete_guard` trigger that blocks deleting a project with recorded
earnings and directs the caller to archive instead (FR-2.5).

---

## Additional decision — the ledger is authoritative

**Decided:** `stage.accepted_price` is a read-model for query performance only.
The append-only `pricing_history` is the source of truth, and the accepted price
is a projection of it.

**Why:** It makes the audit trail tamper-evident. If the stored price and the
ledger ever disagree, that disagreement is *detectable* rather than silent.

**Encoded in:** `src/domain/pricing-ledger.ts` — `projectLedger()` derives the
price, and `reconcile()` reports disagreement. A periodic reconciliation job
should call it; **that job is not yet built**.

---

## Additional decision — storage is an interface, S3 is a binding

**Decided:** Everything depends on the `StorageProvider` interface. The only
implementation today is `LocalDiskStorage`, which writes under
`apps/api/.local-storage`. TBD-01's S3-compatible storage remains the production
answer.

**Why:** Object storage is a deployment concern; the rules about *what may be
stored, by whom, and when* are the domain concern, and only the latter can block
an approval and therefore a payment. Building against the interface let the
inspection-evidence path — and with it the whole money path through to a recorded
earning — be proven end to end without waiting on infrastructure. The S3 provider
is a new class plus one `useClass` change in `StorageModule`.

**Consequence:** Local disk is single-machine and unreplicated, so it is
development-only. `UrlSigner` and the `GET /media/file` route exist solely to give
the local provider the short-lived signed URLs the blueprint requires; against S3
the URL points at the bucket and both become dead code to delete.

**Encoded in:** `src/storage/`. Traversal and signature-forgery guards are
unit-tested in `local-disk.storage.spec.ts` and `url-signer.spec.ts` — over HTTP
the signature check masks the traversal guard, so it must be proven directly.
