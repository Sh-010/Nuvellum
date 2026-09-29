// Pointer gestures for the World Explorer globe, kept free of DOM and Three.js so the state machine and
// the zoom math can be unit-tested. One pointer drags (rotates); two pointers pinch (zoom); a pointer that
// goes down and up without travelling is a tap (select). Any gesture that ever became a pinch never ends
// in a tap, and lifting one finger of a pinch hands over to rotation from the remaining finger's position,
// so the globe never jumps.

export const CAMERA_MIN_Z = 2.15;
export const CAMERA_MAX_Z = 5.2;
export const CAMERA_DEFAULT_Z = 3.25;
export const ZOOM_STEP = 0.45;
export const TAP_SLOP_PX = 5;
const MIN_PINCH_PX = 12;

export const clampCameraZ = (z) => Math.max(CAMERA_MIN_Z, Math.min(CAMERA_MAX_Z, Number.isFinite(z) ? z : CAMERA_DEFAULT_Z));

/** Camera distance for a button press: direction +1 zooms in (closer), -1 zooms out. */
export const stepCameraZ = (z, direction) => clampCameraZ(z - Math.sign(direction) * ZOOM_STEP);

/** Wheel zoom, unchanged from the original handler. */
export const wheelCameraZ = (z, deltaY) => clampCameraZ(z + deltaY * 0.0022);

/**
 * Pinch zoom. The camera distance scales inversely with the finger spread, measured against the spread
 * and camera distance at the start of the pinch (not frame to frame), so small jitters cannot accumulate.
 * Fingers moving apart bring the camera closer (zoom in).
 */
export function pinchCameraZ(startZ, startDistance, distance) {
  const from = Math.max(MIN_PINCH_PX, startDistance), to = Math.max(MIN_PINCH_PX, distance);
  return clampCameraZ(startZ * (from / to));
}

const spread = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createGlobeGesture({ slop = TAP_SLOP_PX } = {}) {
  const pointers = new Map(); // pointerId -> { x, y }, in arrival order
  let mode = 'idle'; // 'idle' | 'drag' | 'pinch'
  let start = { x: 0, y: 0 }, last = { x: 0, y: 0 };
  let moved = false, pinched = false;
  let pinchFrom = { distance: 0, z: CAMERA_DEFAULT_Z };

  const firstTwo = () => [...pointers.values()].slice(0, 2);
  function beginDrag(p) { mode = 'drag'; start = { ...p }; last = { ...p }; }
  function beginPinch(z) {
    const [a, b] = firstTwo();
    mode = 'pinch'; pinched = true;
    pinchFrom = { distance: spread(a, b), z: clampCameraZ(z) };
  }
  // After a pointer leaves, continue with whatever remains without a jump.
  function settle(z) {
    if (pointers.size >= 2) beginPinch(z);
    else if (pointers.size === 1) { beginDrag([...pointers.values()][0]); moved = true; }
    else mode = 'idle';
  }

  return {
    get mode() { return mode; },
    get count() { return pointers.size; },
    get active() { return pointers.size > 0; },
    get pinched() { return pinched; },

    /** A pointer went down; `z` is the current target camera distance. */
    down(id, x, y, z) {
      if (pointers.size === 0) { moved = false; pinched = false; }
      pointers.set(id, { x, y });
      if (pointers.size === 1) beginDrag({ x, y });
      else if (pointers.size === 2) beginPinch(z);
      // A third finger is tracked but ignored until one of the first two lifts.
    },

    /** Returns { type: 'rotate', dx, dy } or { type: 'zoom', z } or null. */
    move(id, x, y) {
      const p = pointers.get(id);
      if (!p) return null;
      p.x = x; p.y = y;
      if (mode === 'drag') {
        const dx = x - last.x, dy = y - last.y;
        if (Math.abs(x - start.x) + Math.abs(y - start.y) > slop) moved = true;
        last = { x, y };
        return dx || dy ? { type: 'rotate', dx, dy } : null;
      }
      if (mode === 'pinch') {
        const [a, b] = firstTwo();
        return { type: 'zoom', z: pinchCameraZ(pinchFrom.z, pinchFrom.distance, spread(a, b)) };
      }
      return null;
    },

    /** A pointer lifted. Returns { type: 'tap', x, y } for a clean single-pointer tap, otherwise null. */
    up(id, x, y, z) {
      if (!pointers.has(id)) return null;
      const wasSingle = pointers.size === 1 && mode === 'drag';
      pointers.delete(id);
      if (wasSingle) {
        mode = 'idle';
        return moved || pinched ? null : { type: 'tap', x, y };
      }
      settle(z);
      return null;
    },

    /** The browser took the pointer away (pointercancel / lost capture): never a tap. */
    cancel(id, z) {
      if (!pointers.has(id)) return;
      pointers.delete(id);
      moved = true;
      settle(z);
    },

    reset() { pointers.clear(); mode = 'idle'; moved = false; pinched = false; }
  };
}
