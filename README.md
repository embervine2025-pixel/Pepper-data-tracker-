# Pepper Data Tracker

Genetic data management for *Capsicum* breeding programmes. Tracks plants and
their parentage, the cross-pollinations that produced them, and pod phenotypes
— and lets a breeder share a single line with a named collaborator without
opening the rest of the collection.

- **Backend** — Node + Express on PostgreSQL 16
- **Frontend** — React 19, Vite, Tailwind CSS v4

---

## Running it

Requires Node 20+ and a PostgreSQL 16 server. Docker is optional.

```bash
npm install                 # installs both workspaces

npm run db:up               # starts postgres in docker (skip if you have your own)
cp server/.env.example server/.env

npm run migrate             # applies the schema
npm run seed                # optional: a worked example pedigree

npm run dev:api             # http://localhost:4000
npm run dev:web             # http://localhost:5173  <- open this one
```

Run the two dev servers in separate terminals; both keep running. Then open
**http://localhost:5173** and sign in with the seeded account below.

Re-running `npm run seed` on a database that already has data is a no-op — it
tells you so rather than failing on a duplicate accession code. To rebuild the
example from scratch, `npm run seed -- --fresh`. The same `--` applies to
`npm run migrate -- --reset`, which drops the schema and reapplies it.

The Vite dev server proxies `/api` to port 4000, so the browser stays on one
origin. Point it elsewhere with `VITE_API_TARGET`.

If you are not using Docker, create the databases by hand:

```bash
createuser pepper --pwprompt
createdb -O pepper pepper_dev
createdb -O pepper pepper_test
```

### Seed data

`npm run seed` builds three breeders and a four-generation *C. chinense*
pedigree (Bhut Jolokia × Trinidad Scorpion → F1 → F2 selections → F3), with
crosses, pod phenotypes, and two live lineage shares. Sign in as
`ava@embervine.test` / `peppergenetics`.

### Tests

```bash
npm test
```

28 integration tests run against `pepper_test`, which is reset first. They
cover authentication, the parentage rules, phenotype validation, and — in
`server/tests/privacy.test.js` — every access-control path.

---

## The data model

```
users ──< plants >── plants          parentage: mother_plant_id / father_plant_id
           │  │
           │  └──< pods              pod phenotype observations
           │
           └──< pollinations         the cross that produced the seed
      
users ──< lineage_shares >── plants  selective, revocable access grants
```

**`plants`** is the centre. Parentage lives directly on the row as
`mother_plant_id` and `father_plant_id`, so a pedigree is a plain recursive
CTE rather than a join table walk. `origin_pollination_id` links a plant back
to the cross whose seed it grew from. Both parent pointers are nullable: a
landrace accession has no recorded parents, and open-pollinated seed has a
known mother but no known father.

**`pollinations`** records the breeding act, and the rules of that act are
CHECK constraints rather than application code — a bagged self must name the
same plant as both parents, open pollination cannot name a pollen parent, and
pods set cannot exceed flowers pollinated.

**`pods`** carries the IPGRI/UPOV Capsicum descriptors (shape, orientation,
surface, wall thickness, placenta colour) plus Scoville. A pungency figure is
rejected unless it says how it was obtained — an estimate and an HPLC result
are not the same evidence, and a database that conflates them is not worth
querying.

A trigger rejects any edit that would make a plant its own ancestor.

### Generations

`generation` is the breeder's label (`P`, `F1`, `BC1F3`), and
`generation_number` is the numeric filial rank used for sorting and for
"everything at F5 and beyond" filters. Growing out a cross through
`POST /api/pollinations/:id/offspring` sets both automatically, continuing
from the seed parent.

---

## Privacy model

Access is **additive**. A plant's `visibility` sets the baseline audience, and
rows in `lineage_shares` grant more on top of it. Nothing ever subtracts.

| Visibility  | Who can read it                                   |
| ----------- | ------------------------------------------------- |
| `private`   | The owner, plus anyone holding an explicit share  |
| `community` | Any signed-in member                              |
| `public`    | Anyone, including unauthenticated visitors        |

A share is a grant from one breeder to one named member, scoped either to the
whole collection or to a single plant. A plant-scoped share can be widened
along the pedigree:

- `include_ancestors` — "here is where this cultivar came from", the common case
- `include_descendants` — the selections made from it

Four properties hold, and each is covered by a test:

1. **Lineage expansion is clipped to plants the granting breeder owns.** A
   parent belonging to someone else stays restricted, so a share cannot be
   laundered onward through the family tree.
2. **Siblings off the shared path stay private.** Sharing an F3 selection with
   its ancestors exposes the pedigree behind it, not the culled selections
   beside it.
3. **Revocation is immediate**, and soft — the row survives as an audit record
   of who once had access.
4. **A plant the viewer cannot see returns 404, not 403.** A 403 would confirm
   the record exists, which is itself private information.

Both rules are SQL functions — `accessible_plant_ids(viewer)` and
`writable_plant_ids(viewer)` — used by every read path in the API, so the
system has exactly one definition of "can see". They are defined in
`server/src/db/migrations/001_init.sql`.

`contribute` permission lets a collaborator record pods and crosses against a
plant (for a trial grow-out in another climate, say) without being able to
edit the plant record itself. Unlike view access, it does not propagate along
the lineage — writes are always explicit.

### Redaction in the family tree

When a pedigree includes a plant the viewer has no right to, the node is
returned **redacted rather than dropped**: the edge stays so the tree keeps its
shape, but every descriptive field is withheld and the UI draws it as a locked
placeholder. Sharing a plant implicitly discloses that it has parents; it
should not disclose what they are.

---

## API

All routes are under `/api`. Authentication is a bearer JWT.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/auth/register` · `/auth/login` | Account creation and sign-in |
| `GET` `PATCH` | `/auth/me` | Current profile |
| `POST` | `/auth/change-password` | Password change |
| `GET` `POST` | `/plants` | List (filter by species, status, owner, text) and create |
| `GET` `PATCH` `DELETE` | `/plants/:id` | Detail with parents and children; owner-only writes |
| `GET` | `/plants/:id/lineage` | Family tree graph, `?up=` and `?down=` generations |
| `GET` | `/plants/:id/ancestors` | Flat pedigree table with the path to each ancestor |
| `GET` `POST` | `/pollinations` | Cross-pollination records |
| `GET` `PATCH` `DELETE` | `/pollinations/:id` | One cross; breeder-only writes |
| `POST` | `/pollinations/:id/offspring` | Grow out a seedling with parentage prefilled |
| `GET` `POST` | `/pods` | Pod phenotypes, filter by shape or Scoville range |
| `GET` `PATCH` `DELETE` | `/pods/:id` | One pod record |
| `GET` | `/pods/summary/:plantId` | Trait averages across a plant's pods |
| `GET` | `/shares/granted` · `/shares/received` | Shares in both directions |
| `POST` `PATCH` `DELETE` | `/shares` · `/shares/:id` | Grant, amend, revoke |
| `GET` | `/shares/audience/:plantId` | Who can currently see a plant, and why |
| `GET` | `/members` · `/members/:handle` | Member directory for choosing who to share with |
| `GET` | `/dashboard/summary` | Landing screen data in one round trip |
| `GET` | `/meta/enums` | Enum vocabularies, so client dropdowns cannot drift |

Requests and responses are camelCase; the database is snake_case, converted at
the serialisation boundary. Validation is zod, and validation failures come
back as `{ error: { message, details: [{ field, message }] } }` so forms can
put messages on the offending input.

---

## Layout

```
server/
  src/
    db/migrations/     001 schema + access functions, 002 cycle guard
    routes/            one router per resource
    services/          access.js (authorisation), lineage.js (pedigree walks)
    lib/               validation, errors, enums
  tests/               api.test.js, privacy.test.js
web/
  src/
    components/        FamilyTree.jsx, ShareDialog.jsx, PlantPicker.jsx, ui.jsx
    pages/             one per route
    context/           AuthContext.jsx
```

The family tree is laid out in generational bands with a barycentre sweep to
order each band — without it the parent edges cross into an unreadable knot
once a pedigree has any width. It is plain SVG with pan and zoom; no chart
library.

---

## Notes and limits

- A **collection-scoped share covers every plant the owner has**, including
  private ones. Breeders who want to hold specific plants back should use
  plant-scoped shares instead. This is deliberate — the alternative, where
  collection shares silently skip private plants, makes the default share
  do nothing.
- Photo attachments are a `photo_url` column only; there is no upload
  pipeline.
- Sessions are stateless JWTs with no refresh or server-side revocation, so a
  token stays valid until it expires (`JWT_EXPIRES_IN`, default 7 days).
- `JWT_SECRET` is **required** in production; outside production a development
  fallback is used so a fresh clone runs without configuration.
