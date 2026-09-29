import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMERA_DEFAULT_Z, CAMERA_MAX_Z, CAMERA_MIN_Z, ZOOM_STEP,
  clampCameraZ, createGlobeGesture, pinchCameraZ, stepCameraZ, wheelCameraZ
} from '../src/lib/globe-gestures.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('camera limits are the original 2.15 – 5.2 and default 3.25', () => {
  assert.equal(CAMERA_MIN_Z, 2.15); assert.equal(CAMERA_MAX_Z, 5.2); assert.equal(CAMERA_DEFAULT_Z, 3.25);
  assert.equal(clampCameraZ(1), 2.15); assert.equal(clampCameraZ(9), 5.2); assert.equal(clampCameraZ(NaN), 3.25);
});

test('wheel zoom keeps the original rate and limits', () => {
  close(wheelCameraZ(3.25, 100), 3.25 + 100 * 0.0022);
  assert.equal(wheelCameraZ(2.2, -1000), 2.15);
  assert.equal(wheelCameraZ(5.1, 1000), 5.2);
});

test('zoom buttons move by a fixed step and stop at the limits', () => {
  close(stepCameraZ(3.25, 1), 3.25 - ZOOM_STEP);
  close(stepCameraZ(3.25, -1), 3.25 + ZOOM_STEP);
  let z = 3.25; for (let i = 0; i < 10; i++) z = stepCameraZ(z, 1); assert.equal(z, CAMERA_MIN_Z);
  for (let i = 0; i < 20; i++) z = stepCameraZ(z, -1); assert.equal(z, CAMERA_MAX_Z);
});

test('pinch math: spreading fingers zooms in, pinching zooms out, relative to the gesture start', () => {
  close(pinchCameraZ(3, 100, 100), 3);
  close(pinchCameraZ(3, 100, 120), 2.5); // apart -> closer
  close(pinchCameraZ(3, 100, 75), 4); // together -> further
  assert.equal(pinchCameraZ(3, 100, 1000), CAMERA_MIN_Z);
  assert.equal(pinchCameraZ(3, 100, 5), CAMERA_MAX_Z);
  assert.ok(Number.isFinite(pinchCameraZ(3, 0, 0)), 'degenerate spread never produces NaN/Infinity');
});

test('pinch is continuous: the same finger spread always gives the same camera distance (no drift)', () => {
  const g = createGlobeGesture();
  g.down(1, 100, 300, 3.25); g.down(2, 200, 300, 3.25);
  const zs = [];
  for (const x of [220, 240, 260, 240, 220, 200]) zs.push(g.move(2, x, 300).z);
  close(zs[0], zs[4]); close(zs[1], zs[3]); close(zs[5], 3.25);
  for (let i = 1; i < 3; i++) assert.ok(zs[i] < zs[i - 1], 'monotonic while spreading');
});

test('one pointer: drag rotates, a still press is a tap', () => {
  const g = createGlobeGesture();
  g.down(1, 50, 50, 3.25);
  assert.equal(g.mode, 'drag');
  assert.deepEqual(g.move(1, 52, 51), { type: 'rotate', dx: 2, dy: 1 });
  assert.deepEqual(g.up(1, 52, 51, 3.25), { type: 'tap', x: 52, y: 51 }, 'within the 5px slop is still a tap');
  assert.equal(g.mode, 'idle'); assert.equal(g.active, false);

  g.down(1, 50, 50, 3.25);
  g.move(1, 70, 50);
  assert.equal(g.up(1, 70, 50, 3.25), null, 'a drag never selects');
});

test('two pointers never select, and releasing one hands over to rotation without a jump', () => {
  const g = createGlobeGesture();
  g.down(1, 100, 100, 3.25); g.down(2, 200, 100, 3.25);
  assert.equal(g.mode, 'pinch');
  assert.equal(g.move(1, 101, 100).type, 'zoom', 'second pointer switches to zoom, not rotation');
  assert.equal(g.up(2, 200, 100, 3.2), null);
  assert.equal(g.mode, 'drag');
  // The first rotation step is measured from the remaining finger's current position.
  assert.deepEqual(g.move(1, 104, 100), { type: 'rotate', dx: 3, dy: 0 });
  assert.equal(g.up(1, 104, 100, 3.2), null, 'the tail of a pinch is not a tap even if the finger is still');
});

test('a still two-finger touch (no spread change) is not a tap either', () => {
  const g = createGlobeGesture();
  g.down(1, 100, 100, 3.25); g.down(2, 110, 100, 3.25);
  assert.equal(g.up(1, 100, 100, 3.25), null);
  assert.equal(g.up(2, 110, 100, 3.25), null);
});

test('repeated pinches start from the camera distance at the time, not the first pinch', () => {
  const g = createGlobeGesture();
  g.down(1, 0, 0, 3.25); g.down(2, 100, 0, 3.25);
  const z1 = g.move(2, 125, 0).z; // spread 125 -> 2.6
  close(z1, 2.6);
  g.up(2, 125, 0, z1); g.up(1, 0, 0, z1);
  g.down(1, 0, 0, z1); g.down(2, 100, 0, z1);
  close(g.move(2, 100, 0).z, z1, 1e-9);
  close(g.move(2, 50, 0).z, clampCameraZ(z1 * 2));
});

test('pointercancel clears state: nothing sticks and nothing selects', () => {
  const g = createGlobeGesture();
  g.down(1, 10, 10, 3.25);
  g.cancel(1, 3.25);
  assert.equal(g.active, false); assert.equal(g.mode, 'idle');
  assert.equal(g.move(1, 20, 20), null, 'moves from a cancelled pointer are ignored');
  assert.equal(g.up(1, 20, 20, 3.25), null);

  g.down(1, 0, 0, 3.25); g.down(2, 100, 0, 3.25);
  g.cancel(2, 3.25);
  assert.equal(g.mode, 'drag', 'cancelling one finger of a pinch falls back to rotation');
  assert.equal(g.up(1, 0, 0, 3.25), null);
  g.cancel(99, 3.25); // unknown pointer is a no-op
  assert.equal(g.active, false);
});

test('a third finger is ignored until one of the pinch pair lifts, then the pinch re-baselines', () => {
  const g = createGlobeGesture();
  g.down(1, 0, 0, 3); g.down(2, 100, 0, 3); g.down(3, 500, 500, 3);
  assert.equal(g.count, 3); assert.equal(g.mode, 'pinch');
  close(g.move(3, 900, 900).z, 3, 1e-9);
  g.up(1, 0, 0, 3);
  assert.equal(g.mode, 'pinch');
  close(g.move(2, 100, 0).z, 3, 1e-9); // new baseline: no jump when the pair changes
});

test('the World Explorer page uses the shared gesture module and shows touch-appropriate instructions', () => {
  const page = readFileSync(new URL('../src/pages/world-explorer.astro', import.meta.url), 'utf8');
  assert.match(page, /from '..\/lib\/globe-gestures\.js'/);
  assert.match(page, /aria-label="Zoom in"/); assert.match(page, /aria-label="Zoom out"/);
  assert.match(page, /class="hint-pointer">Drag to rotate · Wheel to zoom · Click to select/);
  assert.match(page, /class="hint-touch">Drag to rotate · Pinch to zoom · Tap to select/);
  assert.match(page, /\(hover:none\) and \(pointer:coarse\)\{\.hint-pointer\{display:none\}/);
  assert.match(page, /#globeCanvas\{[^}]*touch-action:none/);
  assert.doesNotMatch(page, /targetCameraZ = (?!clampCameraZ|CAMERA_DEFAULT_Z)/, 'every camera change goes through setCameraZ');
});
