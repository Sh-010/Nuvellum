import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief } from '../scripts/visual/brief.mjs';
import { decide, selectBest } from '../scripts/visual/qa.mjs';
import { sanitizeSvg } from '../scripts/visual/svg.mjs';
import { generateCandidates } from '../scripts/visual/providers.mjs';
import { assetKey, parseKey, memoryStorage, findOrphans } from '../scripts/visual/storage.mjs';

const good = { relevance: 8, composition: 8, technical: 8, factual_safety: 9, brand: 8, artifacts: 8, headline_fit: 8, mobile_crop: 8, photoreal_risk: 2 };

test('sensitive stories get the stricter threshold and conceptual treatment', () => {
  const b = buildBrief({ slug: 'x', title: 'Avalanche kills climbers in Nepal', section: 'World' });
  assert.equal(b.sensitive, true);
  assert.equal(b.treatment, 'conceptual');
  const mid = { ...good, relevance: 7.5, composition: 7.5, technical: 7.5, brand: 7.5, artifacts: 7.5, headline_fit: 7.5, mobile_crop: 7.5, factual_safety: 7.5 };
  assert.equal(decide(mid, { ...b, sensitive: false }).pass, true);
  assert.equal(decide(mid, b).pass, false);
});

test('QA fails closed on unsafe signals and picks the best passing candidate', () => {
  const b = buildBrief({ slug: 'x', title: 'New phone launches', section: 'Technology' });
  assert.equal(decide(null, b).pass, false);
  assert.equal(decide({ ...good, has_text_or_logos: true }, b).pass, false);
  assert.equal(decide({ ...good, photoreal_risk: 9 }, b).pass, false);
  const best = selectBest([{ id: 1, decision: decide(good, b) }, { id: 2, decision: decide({ ...good, relevance: 10 }, b) }]);
  assert.equal(best.id, 2);
});

test('sanitizeSvg rejects scripts and text, accepts plain shapes', () => {
  assert.equal(sanitizeSvg('<svg viewBox="0 0 10 10"><script>x</script><rect width="1" height="1"/></svg>').ok, false);
  assert.equal(sanitizeSvg('<svg viewBox="0 0 10 10"><text>hi</text><rect width="1" height="1"/></svg>').ok, false);
  assert.equal(sanitizeSvg('no svg').reason, 'malformed');
  const ok = sanitizeSvg('```svg\n<svg viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#fbf8f1"/></svg>\n```');
  assert.equal(ok.ok, true, ok.detail);
  assert.match(ok.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('provider chain falls through quota to the next provider and never throws', async () => {
  const env = { NUVELLUM_ROLE_IMAGE: 'mock,mock', MOCK_IMAGE_BEHAVIOUR: 'quota' };
  const r = await generateCandidates({ prompt: 'p', candidates: 1, env, deadline: Date.now() + 10000 });
  assert.equal(r.images.length, 0);
  assert.deepEqual(r.attempts.map(a => a.outcome), ['quota', 'quota']);
  const ok = await generateCandidates({ prompt: 'p', candidates: 2, env: { NUVELLUM_ROLE_IMAGE: 'mock' }, deadline: Date.now() + 10000 });
  assert.equal(ok.images.length, 2);
});

test('asset keys are versioned and content-addressed; orphans are detected (dry run)', async () => {
  const bytes = Buffer.from('abc');
  const key = assetKey({ slug: 'a-story', version: 2, bytes, mime: 'image/png' });
  assert.deepEqual(parseKey(key), { slug: 'a-story', version: 2, hash: key.split('-').pop().split('/')[0], variant: 'master', ext: 'png' });
  assert.throws(() => assetKey({ slug: '../x', version: 1, bytes, mime: 'image/png' }));
  const s = memoryStorage();
  await s.put(key, bytes, 'image/png');
  await s.put('visuals/old/v1-deadbeef/master.png', bytes, 'image/png');
  assert.deepEqual(await findOrphans(s, [key]), ['visuals/old/v1-deadbeef/master.png']);
  assert.equal(s.objects.size, 2);
  await findOrphans(s, [key], { remove: true });
  assert.equal(s.objects.size, 1);
});
