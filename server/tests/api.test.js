import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, api, createBreeder, createPlant } from './helpers.js';

// `npm test` resets the schema first; test files run in parallel processes and
// each one works with its own freshly registered breeders, so no file wipes
// another's data.
test.before(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

test('registers a breeder and returns a usable token', async () => {
  const { token, user } = await createBreeder({ displayName: 'Ada Capsicum' });
  assert.equal(user.displayName, 'Ada Capsicum');
  assert.equal(user.defaultVisibility, 'private');

  const me = await api('/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, user.id);
});

test('rejects a duplicate email', async () => {
  const { user } = await createBreeder();
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: {
      email: user.email,
      handle: 'someoneelse',
      password: 'a-long-enough-password',
      displayName: 'Someone Else',
    },
  });
  assert.equal(res.status, 409);
});

test('rejects a short password with a field-level message', async () => {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { email: 'x@example.test', handle: 'shortpw', password: 'short', displayName: 'X' },
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.details.some((d) => d.field === 'password'));
});

test('login fails with the wrong password and succeeds with the right one', async () => {
  const handle = `logintest${Date.now().toString(36).slice(-5)}`;
  await createBreeder({ handle, email: `${handle}@example.test`, password: 'correct-horse-battery' });

  const bad = await api('/api/auth/login', {
    method: 'POST',
    body: { email: `${handle}@example.test`, password: 'wrong-password-here' },
  });
  assert.equal(bad.status, 401);

  const good = await api('/api/auth/login', {
    method: 'POST',
    body: { email: `${handle}@example.test`, password: 'correct-horse-battery' },
  });
  assert.equal(good.status, 200);
  assert.ok(good.body.token);
});

test('unauthenticated writes are refused', async () => {
  const res = await api('/api/plants', {
    method: 'POST',
    body: { accessionCode: 'NOPE-1', name: 'Nope' },
  });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Plants and parentage
// ---------------------------------------------------------------------------

test('records parentage and walks it back as a lineage graph', async () => {
  const { token } = await createBreeder();
  const mother = await createPlant(token, { name: 'Bhut Jolokia', generation: 'P', generationNumber: 0 });
  const father = await createPlant(token, { name: 'Scorpion', generation: 'P', generationNumber: 0 });
  const f1 = await createPlant(token, {
    name: 'F1',
    generation: 'F1',
    generationNumber: 1,
    motherPlantId: mother.id,
    fatherPlantId: father.id,
  });
  const f2 = await createPlant(token, {
    name: 'F2',
    generation: 'F2',
    generationNumber: 2,
    motherPlantId: f1.id,
    fatherPlantId: f1.id,
  });

  const res = await api(`/api/plants/${f2.id}/lineage?up=5&down=2`, { token });
  assert.equal(res.status, 200);

  const ids = res.body.nodes.map((n) => n.id);
  for (const expected of [mother.id, father.id, f1.id, f2.id]) {
    assert.ok(ids.includes(expected), `graph should contain ${expected}`);
  }
  assert.equal(res.body.stats.restricted, 0);

  // The root sits at depth 0 and its grandparents two generations above.
  const byId = Object.fromEntries(res.body.nodes.map((n) => [n.id, n]));
  assert.equal(byId[f2.id].depth, 0);
  assert.equal(byId[f1.id].depth, -1);
  assert.equal(byId[mother.id].depth, -2);

  assert.ok(
    res.body.edges.some((e) => e.parentId === f1.id && e.childId === f2.id && e.role === 'mother'),
  );
});

test('a partial update leaves unmentioned fields alone', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token, {
    generation: 'F2',
    seedSource: 'Assam landrace collection',
    sowDate: '2025-02-11',
    notes: 'Best wall thickness in the block.',
    plantHeightCm: 124,
  });

  const patched = await api(`/api/plants/${plant.id}`, {
    method: 'PATCH',
    token,
    body: { name: 'Renamed only' },
  });
  assert.equal(patched.status, 200);

  assert.equal(patched.body.plant.name, 'Renamed only');
  // Everything the PATCH did not mention must survive it.
  assert.equal(patched.body.plant.generation, 'F2');
  assert.equal(patched.body.plant.seedSource, 'Assam landrace collection');
  assert.equal(patched.body.plant.sowDate, '2025-02-11');
  assert.equal(patched.body.plant.notes, 'Best wall thickness in the block.');
  assert.equal(patched.body.plant.plantHeightCm, 124);
});

test('an explicit null clears a field', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token, { seedSource: 'Original source', generation: 'F2' });

  const patched = await api(`/api/plants/${plant.id}`, {
    method: 'PATCH',
    token,
    body: { seedSource: null },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.plant.seedSource, null);
  assert.equal(patched.body.plant.generation, 'F2');
});

test('a pod update does not blank the rest of the phenotype', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token);

  const created = await api('/api/pods', {
    method: 'POST',
    token,
    body: {
      plantId: plant.id,
      podLabel: 'A-1',
      lengthMm: 64.8,
      widthMm: 36.2,
      colourMature: 'deep red',
      shape: 'conical',
      pungencyShu: 987000,
      pungencyMeasure: 'hplc',
    },
  });
  assert.equal(created.status, 201);

  const patched = await api(`/api/pods/${created.body.pod.id}`, {
    method: 'PATCH',
    token,
    body: { weightG: 16.4 },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.pod.weightG, 16.4);
  assert.equal(patched.body.pod.lengthMm, 64.8);
  assert.equal(patched.body.pod.colourMature, 'deep red');
  assert.equal(patched.body.pod.shape, 'conical');
  assert.equal(patched.body.pod.pungencyShu, 987000);
});

test('refuses to create a parentage cycle', async () => {
  const { token } = await createBreeder();
  const a = await createPlant(token);
  const b = await createPlant(token, { motherPlantId: a.id });

  const res = await api(`/api/plants/${a.id}`, {
    method: 'PATCH',
    token,
    body: { motherPlantId: b.id },
  });
  assert.equal(res.status, 400);
});

test('refuses to name a parent the breeder cannot see', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const hidden = await createPlant(ava.token, { visibility: 'private' });

  const res = await api('/api/plants', {
    method: 'POST',
    token: bo.token,
    body: { accessionCode: 'X-1', name: 'Borrowed lineage', motherPlantId: hidden.id },
  });
  assert.equal(res.status, 400);
});

test('accession codes are unique per breeder but not across breeders', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();

  await createPlant(ava.token, { accessionCode: 'SHARED-CODE' });

  const clash = await api('/api/plants', {
    method: 'POST',
    token: ava.token,
    body: { accessionCode: 'SHARED-CODE', name: 'Duplicate' },
  });
  assert.equal(clash.status, 409);

  const other = await api('/api/plants', {
    method: 'POST',
    token: bo.token,
    body: { accessionCode: 'SHARED-CODE', name: 'Different breeder' },
  });
  assert.equal(other.status, 201);
});

// ---------------------------------------------------------------------------
// Cross-pollination
// ---------------------------------------------------------------------------

test('records a cross and grows out the next generation from it', async () => {
  const { token } = await createBreeder();
  const mother = await createPlant(token, { generationNumber: 0 });
  const father = await createPlant(token, { generationNumber: 0 });

  const cross = await api('/api/pollinations', {
    method: 'POST',
    token,
    body: {
      motherPlantId: mother.id,
      fatherPlantId: father.id,
      method: 'manual_emasculation',
      pollinationDate: '2025-06-02',
      isolationMethod: 'organza bag',
      flowersPollinated: 10,
      podsSet: 6,
      outcome: 'pod_set',
      targetTrait: 'Thicker walls',
    },
  });
  assert.equal(cross.status, 201);
  assert.equal(cross.body.pollination.mother.id, mother.id);

  const offspring = await api(`/api/pollinations/${cross.body.pollination.id}/offspring`, {
    method: 'POST',
    token,
    body: { accessionCode: 'GROW-1', name: 'F1 grow-out' },
  });
  assert.equal(offspring.status, 201);
  assert.equal(offspring.body.plant.motherPlantId, mother.id);
  assert.equal(offspring.body.plant.fatherPlantId, father.id);
  assert.equal(offspring.body.plant.originPollinationId, cross.body.pollination.id);
  // Filial rank defaults to one past the seed parent.
  assert.equal(offspring.body.plant.generationNumber, 1);
  assert.equal(offspring.body.plant.generation, 'F1');
});

test('rejects a self-pollination that names a different pollen parent', async () => {
  const { token } = await createBreeder();
  const mother = await createPlant(token);
  const father = await createPlant(token);

  const res = await api('/api/pollinations', {
    method: 'POST',
    token,
    body: {
      motherPlantId: mother.id,
      fatherPlantId: father.id,
      method: 'bagged_self',
      pollinationDate: '2025-06-02',
    },
  });
  assert.equal(res.status, 400);
});

test('rejects more pods set than flowers pollinated', async () => {
  const { token } = await createBreeder();
  const mother = await createPlant(token);

  const res = await api('/api/pollinations', {
    method: 'POST',
    token,
    body: {
      motherPlantId: mother.id,
      method: 'open_pollination',
      pollinationDate: '2025-06-02',
      flowersPollinated: 3,
      podsSet: 9,
    },
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------------
// Pod phenotypes
// ---------------------------------------------------------------------------

test('records a pod phenotype and summarises it', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token);

  const pod = await api('/api/pods', {
    method: 'POST',
    token,
    body: {
      plantId: plant.id,
      podLabel: 'A-1',
      harvestDate: '2025-08-01',
      colourImmature: 'green',
      colourMature: 'red',
      shape: 'conical',
      orientation: 'pendant',
      surface: 'semi_wrinkled',
      lengthMm: 64.8,
      widthMm: 36.2,
      wallThicknessMm: 3.1,
      weightG: 16.4,
      seedCount: 44,
      pungencyShu: 987000,
      pungencyMeasure: 'sensory_panel',
      heatRating: 9,
      flavourNotes: 'Fruity, apricot finish',
    },
  });
  assert.equal(pod.status, 201);
  assert.equal(pod.body.pod.lengthMm, 64.8);
  assert.equal(pod.body.pod.plant.id, plant.id);

  const summary = await api(`/api/pods/summary/${plant.id}`, { token });
  assert.equal(summary.status, 200);
  assert.equal(Number(summary.body.summary.podCount), 1);
  assert.equal(Number(summary.body.summary.avgShu), 987000);
  assert.equal(summary.body.summary.commonShape, 'conical');
});

test('a Scoville figure without its method is rejected', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token);

  const res = await api('/api/pods', {
    method: 'POST',
    token,
    body: { plantId: plant.id, pungencyShu: 500000 },
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.details.some((d) => d.field === 'pungencyMeasure'));
});

test('rejects impossible pod measurements', async () => {
  const { token } = await createBreeder();
  const plant = await createPlant(token);

  const res = await api('/api/pods', {
    method: 'POST',
    token,
    body: { plantId: plant.id, lengthMm: -5 },
  });
  assert.equal(res.status, 400);
});
