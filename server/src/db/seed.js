/**
 * Development seed: three breeders, a multi-generation Capsicum chinense
 * pedigree with the crosses that produced it, pod phenotypes, and a couple of
 * lineage shares so the privacy behaviour is visible immediately.
 *
 *   npm run seed          (add to whatever is there)
 *   npm run seed -- --fresh   (wipe data first)
 */
import bcrypt from 'bcryptjs';
import { pool, withTransaction, closePool } from './pool.js';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

const PASSWORD = 'peppergenetics';

async function seed({ fresh = false } = {}) {
  if (config.isProduction) throw new Error('Refusing to seed in production');
  await runMigrations({ silent: true });

  if (fresh) {
    // users cascades to plants -> pollinations/pods/shares.
    await pool.query('TRUNCATE users CASCADE');
    console.log('[seed] cleared existing data');
  } else {
    // Seeding twice would trip the per-owner accession uniqueness with a
    // constraint error that says nothing useful. Stop with instructions
    // instead -- re-running the documented command is the obvious thing to
    // try when you are not sure the first one worked.
    const { rows } = await pool.query(
      "SELECT 1 FROM users WHERE email = 'ava@embervine.test' LIMIT 1",
    );
    if (rows.length > 0) {
      console.log('[seed] this database is already seeded — nothing to do.');
      console.log('[seed] to rebuild it from scratch: npm run seed -- --fresh');
      return;
    }
  }

  const passwordHash = await bcrypt.hash(PASSWORD, config.bcryptRounds);

  await withTransaction(async (db) => {
    const user = async (handle, email, name, program, bio, visibility) => {
      const { rows } = await db.query(
        `INSERT INTO users (handle, email, password_hash, display_name, program_name, bio, default_visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (handle) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [handle, email, passwordHash, name, program, bio, visibility],
      );
      return rows[0].id;
    };

    const alice = await user(
      'avaline',
      'ava@embervine.test',
      'Ava Lindqvist',
      'Ember Vine Genetics',
      'Chasing a stable super-hot with fruit-forward flavour and thick walls.',
      'private',
    );
    const bo = await user(
      'bo-nakamura',
      'bo@northline.test',
      'Bo Nakamura',
      'Northline Peppers',
      'Short-season annuum selections for cold climates.',
      'community',
    );
    const cy = await user(
      'cy-mbeki',
      'cy@sunward.test',
      'Cy Mbeki',
      'Sunward Chiles',
      'Baccatum flavour work and landrace preservation.',
      'community',
    );

    const plant = async (owner, data) => {
      const { rows } = await db.query(
        `INSERT INTO plants (
           owner_id, accession_code, name, species, generation, generation_number,
           is_stabilized, mother_plant_id, father_plant_id, seed_source, sow_date,
           first_flower_date, first_ripe_date, plant_height_cm, habit, status, visibility, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id`,
        [
          owner,
          data.code,
          data.name,
          data.species ?? 'chinense',
          data.generation ?? null,
          data.generationNumber ?? null,
          data.stabilized ?? false,
          data.mother ?? null,
          data.father ?? null,
          data.seedSource ?? null,
          data.sowDate ?? null,
          data.firstFlower ?? null,
          data.firstRipe ?? null,
          data.height ?? null,
          data.habit ?? null,
          data.status ?? 'active',
          data.visibility ?? 'private',
          data.notes ?? null,
        ],
      );
      return rows[0].id;
    };

    // -- Ava's super-hot programme -----------------------------------------
    const bhut = await plant(alice, {
      code: 'EV-P-001',
      name: 'Bhut Jolokia (Assam)',
      generation: 'P',
      generationNumber: 0,
      stabilized: true,
      seedSource: 'Assam landrace collection, 2019',
      sowDate: '2022-02-14',
      firstFlower: '2022-05-02',
      firstRipe: '2022-07-11',
      height: 118.0,
      habit: 'erect',
      visibility: 'public',
      notes: 'Reference parent. Consistent 800k-1M SHU, thin walls.',
    });

    const scorpion = await plant(alice, {
      code: 'EV-P-002',
      name: 'Trinidad Scorpion Butch T',
      generation: 'P',
      generationNumber: 0,
      stabilized: true,
      seedSource: 'Exchange with Northline, 2021',
      sowDate: '2022-02-14',
      firstFlower: '2022-04-28',
      firstRipe: '2022-07-04',
      height: 96.5,
      habit: 'intermediate',
      visibility: 'public',
      notes: 'Pollen parent. Heavy scorpion tail, thicker placenta.',
    });

    const { rows: crossRows } = await db.query(
      `INSERT INTO pollinations (
         breeder_id, mother_plant_id, father_plant_id, method, pollination_date,
         isolation_method, flowers_pollinated, pods_set, outcome, harvest_date,
         seeds_harvested, target_trait, notes)
       VALUES ($1,$2,$3,'manual_emasculation','2022-06-02','organza bag',12,7,'pod_set',
               '2022-08-19',214,'Reaper-class heat with thicker pericarp',
               'Emasculated at balloon stage, pollen applied two mornings running.')
       RETURNING id`,
      [alice, bhut, scorpion],
    );
    const crossId = crossRows[0].id;

    const f1 = await plant(alice, {
      code: 'EV-F1-004',
      name: 'Ember F1',
      generation: 'F1',
      generationNumber: 1,
      mother: bhut,
      father: scorpion,
      sowDate: '2023-02-10',
      firstFlower: '2023-05-06',
      firstRipe: '2023-07-22',
      height: 132.0,
      habit: 'erect',
      visibility: 'community',
      notes: 'Uniform as expected for F1. Vigorous, intermediate pod shape.',
    });
    await db.query('UPDATE plants SET origin_pollination_id = $1 WHERE id = $2', [crossId, f1]);

    const { rows: selfRows } = await db.query(
      `INSERT INTO pollinations (
         breeder_id, mother_plant_id, father_plant_id, method, pollination_date,
         isolation_method, flowers_pollinated, pods_set, outcome, harvest_date,
         seeds_harvested, target_trait)
       VALUES ($1,$2,$2,'bagged_self','2023-06-14','organza bag',20,16,'pod_set',
               '2023-09-01',612,'Segregating population for wall thickness')
       RETURNING id`,
      [alice, f1],
    );
    const selfId = selfRows[0].id;

    const f2a = await plant(alice, {
      code: 'EV-F2-011',
      name: 'Ember F2 sel. 11',
      generation: 'F2',
      generationNumber: 2,
      mother: f1,
      father: f1,
      sowDate: '2024-02-08',
      firstRipe: '2024-07-30',
      height: 124.0,
      habit: 'erect',
      visibility: 'private',
      notes: 'Best wall thickness in the F2 block. Keeping forward.',
    });
    const f2b = await plant(alice, {
      code: 'EV-F2-019',
      name: 'Ember F2 sel. 19',
      generation: 'F2',
      generationNumber: 2,
      mother: f1,
      father: f1,
      sowDate: '2024-02-08',
      firstRipe: '2024-08-06',
      height: 141.5,
      habit: 'erect',
      status: 'culled',
      visibility: 'private',
      notes: 'Hottest of the block but pods too small. Culled after seed save.',
    });
    await db.query('UPDATE plants SET origin_pollination_id = $1 WHERE id = ANY($2::uuid[])', [
      selfId,
      [f2a, f2b],
    ]);

    const f3 = await plant(alice, {
      code: 'EV-F3-003',
      name: 'Ember F3 sel. 3',
      generation: 'F3',
      generationNumber: 3,
      mother: f2a,
      father: f2a,
      sowDate: '2025-02-11',
      firstRipe: '2025-07-25',
      height: 127.0,
      habit: 'erect',
      visibility: 'private',
      notes: 'Wall thickness holding at 3mm+. Two more generations to fix.',
    });

    // -- Other breeders ----------------------------------------------------
    const jalapeno = await plant(bo, {
      code: 'NL-A-021',
      name: 'Northline Early Jalapeño',
      species: 'annuum',
      generation: 'F7',
      generationNumber: 7,
      stabilized: true,
      sowDate: '2024-03-20',
      firstRipe: '2024-07-02',
      height: 74.0,
      habit: 'compact',
      visibility: 'public',
      notes: '68 days to first ripe pod at 55°N. Stable.',
    });

    await plant(cy, {
      code: 'SW-B-004',
      name: 'Aji Amarillo (Cusco)',
      species: 'baccatum',
      generation: 'P',
      generationNumber: 0,
      stabilized: true,
      sowDate: '2024-03-01',
      firstRipe: '2024-08-14',
      height: 168.0,
      habit: 'erect',
      visibility: 'public',
      notes: 'Landrace accession. Fruity, moderate heat.',
    });

    // -- Pod phenotypes ----------------------------------------------------
    const pod = async (plantId, recorder, data) =>
      db.query(
        `INSERT INTO pods (
           plant_id, pollination_id, recorded_by, pod_label, harvest_date, fully_ripe,
           days_to_ripen, colour_immature, colour_mature, shape, orientation, surface,
           length_mm, width_mm, wall_thickness_mm, weight_g, seed_count, placenta_colour,
           pungency_shu, pungency_measure, heat_rating, flavour_notes, aroma_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          plantId,
          data.pollination ?? null,
          recorder,
          data.label,
          data.harvest,
          data.ripe ?? true,
          data.days ?? null,
          data.immature ?? null,
          data.mature ?? null,
          data.shape ?? null,
          data.orientation ?? null,
          data.surface ?? null,
          data.length ?? null,
          data.width ?? null,
          data.wall ?? null,
          data.weight ?? null,
          data.seeds ?? null,
          data.placenta ?? null,
          data.shu ?? null,
          data.shuMethod ?? null,
          data.heat ?? null,
          data.flavour ?? null,
          data.aroma ?? null,
        ],
      );

    await pod(bhut, alice, {
      label: 'BJ-01',
      harvest: '2022-07-14',
      days: 88,
      immature: 'green',
      mature: 'red',
      shape: 'elongate',
      orientation: 'pendant',
      surface: 'wrinkled',
      length: 68.4, width: 26.1, wall: 1.4, weight: 8.2, seeds: 34,
      placenta: 'orange',
      shu: 912000, shuMethod: 'hplc', heat: 9,
      flavour: 'Sharp, slightly smoky, little sweetness.',
      aroma: 'Grassy with a faint apricot note.',
    });
    await pod(scorpion, alice, {
      label: 'TS-03',
      harvest: '2022-07-09',
      days: 84,
      immature: 'green', mature: 'red',
      shape: 'conical', orientation: 'pendant', surface: 'corrugated',
      length: 51.2, width: 34.8, wall: 2.2, weight: 12.6, seeds: 41,
      placenta: 'orange',
      shu: 1180000, shuMethod: 'hplc', heat: 10,
      flavour: 'Immediate front-of-mouth burn, faintly floral underneath.',
    });
    await pod(f1, alice, {
      label: 'F1-07', pollination: crossId,
      harvest: '2023-07-28',
      days: 92,
      immature: 'green', mature: 'red',
      shape: 'conical', orientation: 'pendant', surface: 'semi_wrinkled',
      length: 62.0, width: 31.5, wall: 2.0, weight: 11.8, seeds: 38,
      placenta: 'orange',
      shu: 1045000, shuMethod: 'lab_report', heat: 10,
      flavour: 'Between both parents, slightly sweeter than Bhut.',
    });
    await pod(f2a, alice, {
      label: 'F2-11-A', pollination: selfId,
      harvest: '2024-08-02',
      days: 96,
      immature: 'green', mature: 'deep red',
      shape: 'conical', orientation: 'pendant', surface: 'semi_wrinkled',
      length: 64.8, width: 36.2, wall: 3.1, weight: 16.4, seeds: 44,
      placenta: 'orange',
      shu: 987000, shuMethod: 'sensory_panel', heat: 9,
      flavour: 'Noticeably fruitier. Wall thickness is the win here.',
      aroma: 'Ripe apricot.',
    });
    await pod(f2b, alice, {
      label: 'F2-19-A', pollination: selfId,
      harvest: '2024-08-09',
      days: 99,
      immature: 'green', mature: 'red',
      shape: 'elongate', orientation: 'pendant', surface: 'wrinkled',
      length: 44.1, width: 21.0, wall: 1.2, weight: 5.9, seeds: 27,
      placenta: 'red',
      shu: 1310000, shuMethod: 'estimated', heat: 10,
      flavour: 'Brutal heat, very little else.',
    });
    await pod(f3, alice, {
      label: 'F3-03-A',
      harvest: '2025-07-29',
      days: 94,
      immature: 'green', mature: 'deep red',
      shape: 'conical', orientation: 'pendant', surface: 'semi_wrinkled',
      length: 66.0, width: 37.4, wall: 3.3, weight: 17.9, seeds: 46,
      placenta: 'orange',
      shu: 1002000, shuMethod: 'sensory_panel', heat: 9,
      flavour: 'Holding the fruit note. Best eating quality in the line so far.',
    });
    await pod(jalapeno, bo, {
      label: 'NL-21-A',
      harvest: '2024-07-05',
      days: 68,
      immature: 'dark green', mature: 'red',
      shape: 'elongate', orientation: 'pendant', surface: 'smooth',
      length: 82.0, width: 31.0, wall: 4.1, weight: 28.4, seeds: 62,
      placenta: 'green',
      shu: 6400, shuMethod: 'estimated', heat: 3,
      flavour: 'Clean and vegetal, mild corking.',
    });

    // -- Lineage shares ----------------------------------------------------
    // Ava lets Bo see the F3 selection and everything it descends from --
    // the ancestor walk is what makes the shared record meaningful.
    await db.query(
      `INSERT INTO lineage_shares
         (owner_id, grantee_id, scope, plant_id, permission, include_ancestors, include_descendants, note)
       VALUES ($1,$2,'plant',$3,'view',true,false,
               'Full pedigree for the Ember line so you can see where the wall thickness came from.')`,
      [alice, bo, f3],
    );

    // Cy gets contribute rights on the F2 selection, to log pods from a
    // grow-out in a different climate.
    await db.query(
      `INSERT INTO lineage_shares
         (owner_id, grantee_id, scope, plant_id, permission, include_ancestors, include_descendants, note, expires_at)
       VALUES ($1,$2,'plant',$3,'contribute',false,true,
               'Trial grow-out — please log pod data here.', now() + interval '180 days')`,
      [alice, cy, f2a],
    );

    // Bo shares his whole collection back with Ava.
    await db.query(
      `INSERT INTO lineage_shares (owner_id, grantee_id, scope, permission, note)
       VALUES ($1,$2,'collection','view','Open book — happy to swap notes any time.')`,
      [bo, alice],
    );
  });

  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM plants) AS plants,
      (SELECT COUNT(*) FROM pollinations) AS pollinations,
      (SELECT COUNT(*) FROM pods) AS pods,
      (SELECT COUNT(*) FROM lineage_shares) AS shares
  `);

  console.log('[seed] done:', rows[0]);
  console.log(`[seed] sign in as ava@embervine.test / ${PASSWORD}`);
}

seed({ fresh: process.argv.includes('--fresh') })
  .then(() => closePool())
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    await closePool().catch(() => {});
    process.exit(1);
  });
