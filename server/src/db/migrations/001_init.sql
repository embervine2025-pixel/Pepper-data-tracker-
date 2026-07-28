-- 001_init.sql
-- Core schema for the pepper (Capsicum) breeding data platform.
--
-- Domain model
--   users            breeder accounts
--   plants           an individual plant / accession, with parentage pointers
--   pollinations     cross-pollination events (the breeding act)
--   pods             harvested pod phenotype observations
--   lineage_shares   selective, revocable grants of lineage visibility
--
-- Parentage is modelled directly on `plants` (mother_plant_id / father_plant_id)
-- so lineage walks are plain recursive CTEs, with `origin_pollination_id`
-- linking a plant back to the pollination event that produced its seed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Enumerated descriptors
-- Fruit/plant descriptors follow the IPGRI/UPOV Capsicum descriptor list.
-- ---------------------------------------------------------------------------

CREATE TYPE capsicum_species AS ENUM (
  'annuum',
  'chinense',
  'baccatum',
  'frutescens',
  'pubescens',
  'interspecific_hybrid',
  'unknown'
);

-- Additive privacy model: `visibility` is the baseline audience, and
-- rows in `lineage_shares` grant additional access on top of it.
CREATE TYPE plant_visibility AS ENUM (
  'private',    -- owner only, plus anyone holding an explicit share
  'community',  -- any authenticated member
  'public'      -- anyone, including unauthenticated visitors
);

CREATE TYPE plant_status AS ENUM (
  'active',
  'seed_stock',
  'culled',
  'dead',
  'archived'
);

CREATE TYPE growth_habit AS ENUM (
  'prostrate',
  'intermediate',
  'erect',
  'compact'
);

CREATE TYPE pollination_method AS ENUM (
  'manual_emasculation',  -- emasculated bud, hand pollinated, isolated
  'bagged_self',          -- selfed under isolation
  'open_pollination',     -- no isolation, pollen parent unknown
  'sib_cross',            -- sibling x sibling within a line
  'backcross'             -- F1 back to a recurrent parent
);

CREATE TYPE pollination_outcome AS ENUM (
  'pending',
  'pod_set',
  'aborted',
  'failed'
);

CREATE TYPE pod_shape AS ENUM (
  'elongate',
  'almost_round',
  'triangular',
  'campanulate',
  'blocky',
  'conical',
  'oblate',
  'lantern',
  'other'
);

CREATE TYPE pod_orientation AS ENUM (
  'pendant',
  'upright',
  'intermediate'
);

CREATE TYPE pod_surface AS ENUM (
  'smooth',
  'semi_wrinkled',
  'wrinkled',
  'corrugated',
  'pitted'
);

-- How a Scoville figure was arrived at, so estimates are never confused
-- with lab numbers.
CREATE TYPE pungency_method AS ENUM (
  'estimated',
  'sensory_panel',
  'hplc',
  'lab_report'
);

CREATE TYPE share_scope AS ENUM (
  'collection',  -- every plant the owner has
  'plant'        -- one plant, optionally widened along its lineage
);

CREATE TYPE share_permission AS ENUM (
  'view',        -- read the plant record and its pods
  'contribute'   -- read, plus record pods/pollinations against it
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL UNIQUE,
  handle             citext NOT NULL UNIQUE,
  password_hash      text NOT NULL,
  display_name       text NOT NULL,
  program_name       text,
  bio                text,
  default_visibility plant_visibility NOT NULL DEFAULT 'private',
  discoverable       boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT users_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT users_display_name_len CHECK (char_length(display_name) BETWEEN 1 AND 120)
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- plants
-- ---------------------------------------------------------------------------

CREATE TABLE plants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  accession_code        text NOT NULL,
  name                  text NOT NULL,
  species               capsicum_species NOT NULL DEFAULT 'unknown',

  -- Filial bookkeeping. `generation` is the breeder-facing label (F2, S1,
  -- BC1F3); `generation_number` is the numeric filial rank used for sorting
  -- and for "show me everything at F5+" style filters.
  generation            text,
  generation_number     smallint,
  is_stabilized         boolean NOT NULL DEFAULT false,

  -- Parentage. Both nullable: a landrace or purchased seed has no recorded
  -- parents, and open-pollinated seed has a known mother but no known father.
  mother_plant_id       uuid REFERENCES plants(id) ON DELETE SET NULL,
  father_plant_id       uuid REFERENCES plants(id) ON DELETE SET NULL,
  origin_pollination_id uuid,  -- FK added after `pollinations` exists

  seed_source           text,
  seed_lot              text,

  sow_date              date,
  transplant_date       date,
  first_flower_date     date,
  first_ripe_date       date,

  plant_height_cm       numeric(6,1),
  habit                 growth_habit,
  leaf_colour           text,

  status                plant_status NOT NULL DEFAULT 'active',
  visibility            plant_visibility NOT NULL DEFAULT 'private',
  notes                 text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plants_accession_unique_per_owner UNIQUE (owner_id, accession_code),
  CONSTRAINT plants_not_own_mother CHECK (mother_plant_id IS NULL OR mother_plant_id <> id),
  CONSTRAINT plants_not_own_father CHECK (father_plant_id IS NULL OR father_plant_id <> id),
  CONSTRAINT plants_generation_number_range CHECK (generation_number IS NULL OR generation_number BETWEEN 0 AND 100),
  CONSTRAINT plants_height_positive CHECK (plant_height_cm IS NULL OR plant_height_cm > 0),
  CONSTRAINT plants_accession_len CHECK (char_length(accession_code) BETWEEN 1 AND 64),
  CONSTRAINT plants_name_len CHECK (char_length(name) BETWEEN 1 AND 160)
);

CREATE INDEX plants_owner_idx      ON plants (owner_id);
CREATE INDEX plants_mother_idx     ON plants (mother_plant_id) WHERE mother_plant_id IS NOT NULL;
CREATE INDEX plants_father_idx     ON plants (father_plant_id) WHERE father_plant_id IS NOT NULL;
CREATE INDEX plants_visibility_idx ON plants (visibility);
CREATE INDEX plants_species_idx    ON plants (species);
CREATE INDEX plants_name_trgm_idx  ON plants (lower(name));

CREATE TRIGGER plants_set_updated_at
  BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- pollinations  (cross-pollination records)
-- ---------------------------------------------------------------------------

CREATE TABLE pollinations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  breeder_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  mother_plant_id     uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  -- NULL when the pollen parent is unknown (open pollination).
  father_plant_id     uuid REFERENCES plants(id) ON DELETE SET NULL,

  method              pollination_method NOT NULL,
  pollination_date    date NOT NULL,
  isolation_method    text,          -- organza bag, cage, bud tape...
  flowers_pollinated  integer NOT NULL DEFAULT 1,
  pods_set            integer,
  outcome             pollination_outcome NOT NULL DEFAULT 'pending',

  harvest_date        date,
  seeds_harvested     integer,
  target_trait        text,          -- the breeding objective for this cross
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pollinations_open_has_no_father
    CHECK (method <> 'open_pollination' OR father_plant_id IS NULL),
  CONSTRAINT pollinations_self_is_self
    CHECK (method <> 'bagged_self' OR father_plant_id = mother_plant_id),
  CONSTRAINT pollinations_flowers_positive CHECK (flowers_pollinated > 0),
  CONSTRAINT pollinations_pods_set_sane
    CHECK (pods_set IS NULL OR (pods_set >= 0 AND pods_set <= flowers_pollinated)),
  CONSTRAINT pollinations_seeds_nonneg CHECK (seeds_harvested IS NULL OR seeds_harvested >= 0),
  CONSTRAINT pollinations_harvest_after_pollination
    CHECK (harvest_date IS NULL OR harvest_date >= pollination_date)
);

CREATE INDEX pollinations_breeder_idx ON pollinations (breeder_id);
CREATE INDEX pollinations_mother_idx  ON pollinations (mother_plant_id);
CREATE INDEX pollinations_father_idx  ON pollinations (father_plant_id) WHERE father_plant_id IS NOT NULL;
CREATE INDEX pollinations_date_idx    ON pollinations (pollination_date DESC);

CREATE TRIGGER pollinations_set_updated_at
  BEFORE UPDATE ON pollinations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Close the plants -> pollinations loop now that the table exists.
ALTER TABLE plants
  ADD CONSTRAINT plants_origin_pollination_fkey
  FOREIGN KEY (origin_pollination_id) REFERENCES pollinations(id) ON DELETE SET NULL;

CREATE INDEX plants_origin_pollination_idx
  ON plants (origin_pollination_id) WHERE origin_pollination_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- pods  (pod phenotype observations)
-- ---------------------------------------------------------------------------

CREATE TABLE pods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id            uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  -- Set when this pod came from a recorded cross, which is what makes a pod
  -- a seed source for the next generation.
  pollination_id      uuid REFERENCES pollinations(id) ON DELETE SET NULL,
  recorded_by         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  pod_label           text,
  harvest_date        date,
  fully_ripe          boolean NOT NULL DEFAULT true,
  days_to_ripen       integer,

  colour_immature     text,
  colour_mature       text,
  shape               pod_shape,
  orientation         pod_orientation,
  surface             pod_surface,

  length_mm           numeric(6,2),
  width_mm            numeric(6,2),
  wall_thickness_mm   numeric(5,2),
  weight_g            numeric(7,2),
  seed_count          integer,
  placenta_colour     text,

  pungency_shu        integer,
  pungency_measure    pungency_method,
  heat_rating         smallint,   -- 0-10 breeder's own scale
  flavour_notes       text,
  aroma_notes         text,
  photo_url           text,
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pods_length_positive     CHECK (length_mm IS NULL OR length_mm > 0),
  CONSTRAINT pods_width_positive      CHECK (width_mm IS NULL OR width_mm > 0),
  CONSTRAINT pods_wall_positive       CHECK (wall_thickness_mm IS NULL OR wall_thickness_mm > 0),
  CONSTRAINT pods_weight_positive     CHECK (weight_g IS NULL OR weight_g > 0),
  CONSTRAINT pods_seed_count_nonneg   CHECK (seed_count IS NULL OR seed_count >= 0),
  CONSTRAINT pods_days_to_ripen_range CHECK (days_to_ripen IS NULL OR days_to_ripen BETWEEN 0 AND 400),
  -- Upper bound sits above the hottest cultivars on record with headroom.
  CONSTRAINT pods_shu_range           CHECK (pungency_shu IS NULL OR pungency_shu BETWEEN 0 AND 5000000),
  CONSTRAINT pods_heat_rating_range   CHECK (heat_rating IS NULL OR heat_rating BETWEEN 0 AND 10),
  -- A Scoville figure without its provenance is not a usable datum.
  CONSTRAINT pods_shu_needs_method    CHECK (pungency_shu IS NULL OR pungency_measure IS NOT NULL)
);

CREATE INDEX pods_plant_idx       ON pods (plant_id);
CREATE INDEX pods_pollination_idx ON pods (pollination_id) WHERE pollination_id IS NOT NULL;
CREATE INDEX pods_recorded_by_idx ON pods (recorded_by);
CREATE INDEX pods_harvest_idx     ON pods (harvest_date DESC NULLS LAST);
CREATE INDEX pods_shu_idx         ON pods (pungency_shu DESC NULLS LAST);

CREATE TRIGGER pods_set_updated_at
  BEFORE UPDATE ON pods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- lineage_shares  (selective privacy)
-- ---------------------------------------------------------------------------
--
-- A share is a grant from one breeder to one other member. Scope is either
-- the owner's whole collection, or a single plant which can be widened to
-- that plant's ancestors and/or descendants -- the usual case being "you may
-- see where this cultivar came from", i.e. the ancestor walk.
--
-- Expansion along lineage is always clipped to plants the granting owner
-- actually owns: you cannot hand out access to a collaborator's plant that
-- happens to sit in your family tree.

CREATE TABLE lineage_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  scope               share_scope NOT NULL,
  plant_id            uuid REFERENCES plants(id) ON DELETE CASCADE,
  permission          share_permission NOT NULL DEFAULT 'view',

  include_ancestors   boolean NOT NULL DEFAULT true,
  include_descendants boolean NOT NULL DEFAULT false,

  note                text,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shares_no_self_grant CHECK (owner_id <> grantee_id),
  CONSTRAINT shares_scope_plant_consistency CHECK (
    (scope = 'plant'      AND plant_id IS NOT NULL) OR
    (scope = 'collection' AND plant_id IS NULL)
  )
);

-- One live grant per (owner, grantee, target). Revoked rows stay behind as an
-- audit trail, so the uniqueness only applies while revoked_at IS NULL.
CREATE UNIQUE INDEX shares_unique_live_plant
  ON lineage_shares (owner_id, grantee_id, plant_id)
  WHERE revoked_at IS NULL AND scope = 'plant';

CREATE UNIQUE INDEX shares_unique_live_collection
  ON lineage_shares (owner_id, grantee_id)
  WHERE revoked_at IS NULL AND scope = 'collection';

CREATE INDEX shares_grantee_idx ON lineage_shares (grantee_id) WHERE revoked_at IS NULL;
CREATE INDEX shares_owner_idx   ON lineage_shares (owner_id);
CREATE INDEX shares_plant_idx   ON lineage_shares (plant_id) WHERE plant_id IS NOT NULL;

CREATE TRIGGER shares_set_updated_at
  BEFORE UPDATE ON lineage_shares
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

-- Every plant id `viewer` is allowed to read. `viewer` may be NULL for an
-- unauthenticated request, which collapses the result to public plants only.
-- Used as `WHERE p.id IN (SELECT plant_id FROM accessible_plant_ids($1))`
-- by every read path in the API, so there is exactly one definition of
-- "can see" in the system.
CREATE OR REPLACE FUNCTION accessible_plant_ids(viewer uuid)
RETURNS TABLE (plant_id uuid)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE
  active_shares AS (
    SELECT s.owner_id, s.scope, s.plant_id, s.include_ancestors, s.include_descendants
    FROM lineage_shares s
    WHERE viewer IS NOT NULL
      AND s.grantee_id = viewer
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > now())
  ),
  collection_grants AS (
    SELECT p.id
    FROM plants p
    JOIN active_shares s ON s.scope = 'collection' AND p.owner_id = s.owner_id
  ),
  seed_plants AS (
    SELECT s.plant_id AS id, s.owner_id, s.include_ancestors, s.include_descendants
    FROM active_shares s
    WHERE s.scope = 'plant' AND s.plant_id IS NOT NULL
  ),
  -- Walk up from each shared plant through mother/father links.
  ancestor_grants AS (
    SELECT sp.id, sp.owner_id, sp.include_ancestors, 0 AS depth
    FROM seed_plants sp
    UNION
    SELECT parent.id, a.owner_id, a.include_ancestors, a.depth + 1
    FROM ancestor_grants a
    JOIN plants child  ON child.id = a.id
    JOIN plants parent ON parent.id IN (child.mother_plant_id, child.father_plant_id)
    WHERE a.include_ancestors
      AND parent.owner_id = a.owner_id   -- never leak another breeder's plant
      AND a.depth < 32                   -- belt-and-braces cycle guard
  ),
  -- Walk down to selections made from each shared plant.
  descendant_grants AS (
    SELECT sp.id, sp.owner_id, sp.include_descendants, 0 AS depth
    FROM seed_plants sp
    UNION
    SELECT child.id, d.owner_id, d.include_descendants, d.depth + 1
    FROM descendant_grants d
    JOIN plants child
      ON child.mother_plant_id = d.id OR child.father_plant_id = d.id
    WHERE d.include_descendants
      AND child.owner_id = d.owner_id
      AND d.depth < 32
  )
  SELECT p.id FROM plants p WHERE viewer IS NOT NULL AND p.owner_id = viewer
  UNION
  SELECT p.id FROM plants p WHERE p.visibility = 'public'
  UNION
  SELECT p.id FROM plants p WHERE p.visibility = 'community' AND viewer IS NOT NULL
  UNION
  SELECT id FROM collection_grants
  UNION
  SELECT id FROM ancestor_grants
  UNION
  SELECT id FROM descendant_grants;
$$;

-- Plants `viewer` may attach new records to (pods, pollinations): owned
-- outright, or covered by a live 'contribute' grant.
CREATE OR REPLACE FUNCTION writable_plant_ids(viewer uuid)
RETURNS TABLE (plant_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT p.id FROM plants p WHERE viewer IS NOT NULL AND p.owner_id = viewer
  UNION
  SELECT p.id
  FROM plants p
  JOIN lineage_shares s
    ON s.permission = 'contribute'
   AND s.revoked_at IS NULL
   AND (s.expires_at IS NULL OR s.expires_at > now())
   AND s.grantee_id = viewer
   AND (
     (s.scope = 'collection' AND s.owner_id = p.owner_id) OR
     (s.scope = 'plant' AND s.plant_id = p.id)
   )
  WHERE viewer IS NOT NULL;
$$;
