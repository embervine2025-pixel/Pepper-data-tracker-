-- 002_lineage_cycle_guard.sql
--
-- Parentage must stay acyclic: a plant can never be its own ancestor. The
-- single-row CHECK constraints in 001 only catch the trivial self-reference,
-- so this adds a trigger that walks the proposed ancestry before allowing a
-- parent pointer to be set.

CREATE OR REPLACE FUNCTION plants_reject_lineage_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  offending uuid;
BEGIN
  IF NEW.mother_plant_id IS NULL AND NEW.father_plant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nothing to check if the parent pointers are unchanged.
  IF TG_OP = 'UPDATE'
     AND NEW.mother_plant_id IS NOT DISTINCT FROM OLD.mother_plant_id
     AND NEW.father_plant_id IS NOT DISTINCT FROM OLD.father_plant_id THEN
    RETURN NEW;
  END IF;

  -- Walk up from the proposed parents. If we reach NEW.id, the edge would
  -- close a loop.
  WITH RECURSIVE ancestry AS (
    SELECT p.id, p.mother_plant_id, p.father_plant_id, 1 AS depth
    FROM plants p
    WHERE p.id IN (NEW.mother_plant_id, NEW.father_plant_id)
    UNION
    SELECT p.id, p.mother_plant_id, p.father_plant_id, a.depth + 1
    FROM ancestry a
    JOIN plants p ON p.id IN (a.mother_plant_id, a.father_plant_id)
    WHERE a.depth < 64
  )
  SELECT a.id INTO offending FROM ancestry a WHERE a.id = NEW.id LIMIT 1;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'lineage cycle: plant % cannot be its own ancestor', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER plants_lineage_cycle_guard
  BEFORE INSERT OR UPDATE OF mother_plant_id, father_plant_id ON plants
  FOR EACH ROW EXECUTE FUNCTION plants_reject_lineage_cycle();
