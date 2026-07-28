import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, api, createBreeder, createPlant } from './helpers.js';

test.before(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

/** Builds P x P -> F1 -> F2 -> F3, all private, owned by one breeder. */
async function buildPedigree(token) {
  const mother = await createPlant(token, { name: 'Bhut', generationNumber: 0, visibility: 'private' });
  const father = await createPlant(token, { name: 'Scorpion', generationNumber: 0, visibility: 'private' });
  const f1 = await createPlant(token, {
    name: 'F1', generationNumber: 1, visibility: 'private',
    motherPlantId: mother.id, fatherPlantId: father.id,
  });
  const f2 = await createPlant(token, {
    name: 'F2 keeper', generationNumber: 2, visibility: 'private',
    motherPlantId: f1.id, fatherPlantId: f1.id,
  });
  const sibling = await createPlant(token, {
    name: 'F2 culled sibling', generationNumber: 2, visibility: 'private',
    motherPlantId: f1.id, fatherPlantId: f1.id,
  });
  const f3 = await createPlant(token, {
    name: 'F3 selection', generationNumber: 3, visibility: 'private',
    motherPlantId: f2.id, fatherPlantId: f2.id,
  });
  return { mother, father, f1, f2, sibling, f3 };
}

// ---------------------------------------------------------------------------
// Baseline visibility
// ---------------------------------------------------------------------------

test('a private plant is invisible to another breeder', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'private' });

  const direct = await api(`/api/plants/${plant.id}`, { token: bo.token });
  // 404 rather than 403: confirming the record exists would itself leak.
  assert.equal(direct.status, 404);

  const list = await api('/api/plants', { token: bo.token });
  assert.ok(!list.body.plants.some((p) => p.id === plant.id));
});

test('a public plant is readable without signing in, a community one is not', async () => {
  const ava = await createBreeder();
  const publicPlant = await createPlant(ava.token, { visibility: 'public' });
  const communityPlant = await createPlant(ava.token, { visibility: 'community' });

  assert.equal((await api(`/api/plants/${publicPlant.id}`)).status, 200);
  assert.equal((await api(`/api/plants/${communityPlant.id}`)).status, 404);

  const bo = await createBreeder();
  assert.equal((await api(`/api/plants/${communityPlant.id}`, { token: bo.token })).status, 200);
});

test('another breeder cannot edit or delete a plant they can see', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'public' });

  const patch = await api(`/api/plants/${plant.id}`, {
    method: 'PATCH', token: bo.token, body: { name: 'Hijacked' },
  });
  assert.equal(patch.status, 403);

  const del = await api(`/api/plants/${plant.id}`, { method: 'DELETE', token: bo.token });
  assert.equal(del.status, 403);
});

// ---------------------------------------------------------------------------
// Selective lineage sharing
// ---------------------------------------------------------------------------

test('a plant share with ancestors opens exactly the pedigree path, and nothing beside it', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const p = await buildPedigree(ava.token);

  const share = await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: {
      granteeHandle: bo.user.handle,
      scope: 'plant',
      plantId: p.f3.id,
      permission: 'view',
      includeAncestors: true,
    },
  });
  assert.equal(share.status, 201);

  // Everything on the path from F3 back to the founding parents.
  for (const plant of [p.f3, p.f2, p.f1, p.mother, p.father]) {
    const res = await api(`/api/plants/${plant.id}`, { token: bo.token });
    assert.equal(res.status, 200, `${plant.name} should be visible`);
  }

  // The culled F2 sibling is not an ancestor of F3, so it stays private.
  const sibling = await api(`/api/plants/${p.sibling.id}`, { token: bo.token });
  assert.equal(sibling.status, 404, 'a sibling off the pedigree path must stay private');
});

test('a share without ancestors exposes only the named plant', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const p = await buildPedigree(ava.token);

  await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: {
      granteeHandle: bo.user.handle,
      scope: 'plant',
      plantId: p.f3.id,
      includeAncestors: false,
    },
  });

  assert.equal((await api(`/api/plants/${p.f3.id}`, { token: bo.token })).status, 200);
  assert.equal((await api(`/api/plants/${p.f2.id}`, { token: bo.token })).status, 404);
});

test('a collection share covers every plant the owner has', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const p = await buildPedigree(ava.token);

  await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'collection' },
  });

  for (const plant of Object.values(p)) {
    assert.equal((await api(`/api/plants/${plant.id}`, { token: bo.token })).status, 200);
  }
});

test('revoking a share closes access immediately', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'private' });

  const share = await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'plant', plantId: plant.id },
  });
  assert.equal((await api(`/api/plants/${plant.id}`, { token: bo.token })).status, 200);

  const revoked = await api(`/api/shares/${share.body.share.id}`, {
    method: 'DELETE',
    token: ava.token,
  });
  assert.equal(revoked.status, 204);
  assert.equal((await api(`/api/plants/${plant.id}`, { token: bo.token })).status, 404);

  // The revoked grant survives as an audit record.
  const history = await api('/api/shares/granted?includeRevoked=true', { token: ava.token });
  assert.ok(history.body.shares.some((s) => s.id === share.body.share.id && s.revokedAt));
});

test('an expired share grants nothing', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'private' });

  const share = await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: {
      granteeHandle: bo.user.handle,
      scope: 'plant',
      plantId: plant.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  assert.equal(share.status, 201);
  assert.equal((await api(`/api/plants/${plant.id}`, { token: bo.token })).status, 200);

  // Move the expiry into the past.
  await api(`/api/shares/${share.body.share.id}`, {
    method: 'PATCH',
    token: ava.token,
    body: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
  });
  assert.equal((await api(`/api/plants/${plant.id}`, { token: bo.token })).status, 404);
});

test('a breeder cannot share a plant they do not own', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const cy = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'public' });

  const res = await api('/api/shares', {
    method: 'POST',
    token: bo.token,
    body: { granteeHandle: cy.user.handle, scope: 'plant', plantId: plant.id },
  });
  assert.equal(res.status, 403);
});

test('a received share cannot be re-shared onward through the lineage', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const cy = await createBreeder();
  const p = await buildPedigree(ava.token);

  await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'plant', plantId: p.f3.id, includeAncestors: true },
  });

  // Bo can read Ava's F1, but a collection share from Bo must not carry it on
  // to Cy -- expansion is clipped to plants the granting breeder owns.
  await api('/api/shares', {
    method: 'POST',
    token: bo.token,
    body: { granteeHandle: cy.user.handle, scope: 'collection' },
  });

  assert.equal((await api(`/api/plants/${p.f1.id}`, { token: bo.token })).status, 200);
  assert.equal((await api(`/api/plants/${p.f1.id}`, { token: cy.token })).status, 404);
});

// ---------------------------------------------------------------------------
// Lineage redaction
// ---------------------------------------------------------------------------

test('lineage keeps the shape of the tree but withholds restricted nodes', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const p = await buildPedigree(ava.token);

  // Only the F3 itself, so its parents show up as restricted placeholders.
  await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'plant', plantId: p.f3.id, includeAncestors: false },
  });

  const res = await api(`/api/plants/${p.f3.id}/lineage?up=3&down=0`, { token: bo.token });
  assert.equal(res.status, 200);

  const byId = Object.fromEntries(res.body.nodes.map((n) => [n.id, n]));
  assert.equal(byId[p.f3.id].restricted, false);
  assert.equal(byId[p.f2.id].restricted, true);
  assert.equal(byId[p.f2.id].name, 'Restricted');
  assert.equal(byId[p.f2.id].owner, null);
  assert.ok(res.body.stats.restricted >= 1);
});

// ---------------------------------------------------------------------------
// Contribute permission
// ---------------------------------------------------------------------------

test('view-only access cannot record pods, contribute access can', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const plant = await createPlant(ava.token, { visibility: 'private' });

  const share = await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'plant', plantId: plant.id, permission: 'view' },
  });

  const refused = await api('/api/pods', {
    method: 'POST',
    token: bo.token,
    body: { plantId: plant.id, podLabel: 'B-1' },
  });
  assert.equal(refused.status, 403);

  await api(`/api/shares/${share.body.share.id}`, {
    method: 'PATCH',
    token: ava.token,
    body: { permission: 'contribute' },
  });

  const allowed = await api('/api/pods', {
    method: 'POST',
    token: bo.token,
    body: { plantId: plant.id, podLabel: 'B-1', lengthMm: 50 },
  });
  assert.equal(allowed.status, 201);
});

test('the owner can see who currently has access and why', async () => {
  const ava = await createBreeder();
  const bo = await createBreeder();
  const p = await buildPedigree(ava.token);

  await api('/api/shares', {
    method: 'POST',
    token: ava.token,
    body: { granteeHandle: bo.user.handle, scope: 'plant', plantId: p.f3.id, includeAncestors: true },
  });

  // Asked about an ancestor, the audience still reports Bo -- that is the
  // reach of the grant the owner made.
  const res = await api(`/api/shares/audience/${p.f1.id}`, { token: ava.token });
  assert.equal(res.status, 200);
  assert.ok(res.body.audience.some((a) => a.member.handle === bo.user.handle));

  const denied = await api(`/api/shares/audience/${p.f1.id}`, { token: bo.token });
  assert.equal(denied.status, 403);
});
