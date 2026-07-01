import { describe, it, expect } from 'vitest';
import { evaluateDemoMode, isDemoDeviceAllowed, type DemoModeEnv, type DeviceEnv } from '../demo-mode.ts';

// Guards issue #27 (demo-by-default). The whole point is that the demo jar gets
// routed/reseeded WITHOUT ever touching the real `learning-chinese-user` jar, so
// the cases that must return FALSE are as load-bearing as the TRUE ones.

const DEPLOYED = 'learnchinese.hsu.mobi';

function env(p: Partial<DemoModeEnv>): DemoModeEnv {
  return { search: '', hostname: DEPLOYED, standalone: false, ...p };
}

describe('evaluateDemoMode', () => {
  it('explicit ?demo is demo on the deployed host', () => {
    expect(evaluateDemoMode(env({ search: '?app&demo' }))).toBe(true);
    expect(evaluateDemoMode(env({ search: '?demo' }))).toBe(true);
  });

  it('explicit ?demo is demo even on a dev host or standalone', () => {
    expect(evaluateDemoMode(env({ search: '?demo', hostname: 'localhost' }))).toBe(true);
    expect(evaluateDemoMode(env({ search: '?demo', standalone: true }))).toBe(true);
  });

  it('public browser ?app on the deployed host IS demo (#27)', () => {
    expect(evaluateDemoMode(env({ search: '?app' }))).toBe(true);
  });

  it('installed PWA (standalone) ?app is NOT demo — keeps the real jar', () => {
    expect(evaluateDemoMode(env({ search: '?app', standalone: true }))).toBe(false);
  });

  it('dev / LAN / .local host ?app is NOT demo — developer uses the real jar', () => {
    for (const hostname of ['localhost', '127.0.0.1', '192.168.1.5', '10.0.0.2', '172.16.0.9', 'macbook.local']) {
      expect(evaluateDemoMode(env({ search: '?app', hostname }))).toBe(false);
    }
  });

  it('no qualifying param is NOT demo (real jar / marketing landing)', () => {
    expect(evaluateDemoMode(env({ search: '' }))).toBe(false);
    expect(evaluateDemoMode(env({ search: '?landing' }))).toBe(false);
    expect(evaluateDemoMode(env({ search: '?ui' }))).toBe(false);
  });

  it('public-IP-looking but not private ranges still count as deployed (e.g. 172.32.x)', () => {
    // 172.32 is outside the private 172.16–31 block — treated as a real deployed host.
    expect(evaluateDemoMode(env({ search: '?app', hostname: '172.32.0.1' }))).toBe(true);
  });
});

// Issue #66: the demo-ACCESS device gate. Kept SEPARATE from evaluateDemoMode so
// a desktop demo visitor is still a "demo session" (isolated `-demo` jar,
// unchanged) but is not admitted into the mobile-only demo experience — App.tsx
// shows the "open on your phone" QR fallback instead. Capability detection, NOT
// UA sniffing: a device is allowed if ANY touch/coarse signal is set.
function dev(p: Partial<DeviceEnv>): DeviceEnv {
  return { coarsePointer: false, hoverNone: false, touchCapable: false, ...p };
}

describe('isDemoDeviceAllowed (issue #66 device gate)', () => {
  it('a desktop (fine pointer, hover, no touch) is NOT allowed into the demo', () => {
    expect(isDemoDeviceAllowed(dev({}))).toBe(false);
  });

  it('a coarse-pointer device (phone/tablet) IS allowed', () => {
    expect(isDemoDeviceAllowed(dev({ coarsePointer: true }))).toBe(true);
  });

  it('a hover:none device (touch-first) IS allowed', () => {
    expect(isDemoDeviceAllowed(dev({ hoverNone: true }))).toBe(true);
  });

  it('a touch-capable device (ontouchstart / maxTouchPoints) IS allowed', () => {
    expect(isDemoDeviceAllowed(dev({ touchCapable: true }))).toBe(true);
  });

  it('any single touch/coarse signal is enough (OR of the three)', () => {
    expect(isDemoDeviceAllowed(dev({ coarsePointer: true, hoverNone: false, touchCapable: false }))).toBe(true);
    expect(isDemoDeviceAllowed(dev({ coarsePointer: false, hoverNone: true, touchCapable: false }))).toBe(true);
    expect(isDemoDeviceAllowed(dev({ coarsePointer: false, hoverNone: false, touchCapable: true }))).toBe(true);
    // A touchscreen laptop that ALSO reports a fine pointer is admitted (it can
    // run the demo) — the gate is permissive toward touch, strict toward pure
    // mouse-only desktops.
    expect(isDemoDeviceAllowed(dev({ coarsePointer: false, hoverNone: false, touchCapable: true }))).toBe(true);
  });
});

// The gate is the CONJUNCTION of the two independent decisions. This mirrors the
// runtime isDemoDeviceGated() (= isDemoMode() && !isDemoDeviceAllowedNow()) using
// the pure predicates, proving the intended matrix: only a demo session on a
// non-touch device is gated; the real app is NEVER gated on any device.
describe('demo gate composition (evaluateDemoMode × isDemoDeviceAllowed)', () => {
  const gated = (e: Partial<DemoModeEnv>, d: Partial<DeviceEnv>) =>
    evaluateDemoMode(env(e)) && !isDemoDeviceAllowed(dev(d));

  it('desktop on the demo path (?demo / ?app) is GATED', () => {
    expect(gated({ search: '?demo' }, {})).toBe(true);
    expect(gated({ search: '?app' }, {})).toBe(true);
  });

  it('a touch device on the demo path is NOT gated (demo boots as before)', () => {
    expect(gated({ search: '?demo' }, { coarsePointer: true })).toBe(false);
    expect(gated({ search: '?app' }, { touchCapable: true })).toBe(false);
  });

  it('the REAL app is never gated, even on a pure desktop', () => {
    // Installed PWA (?app standalone), dev/LAN host, and non-demo params are all
    // NOT demo sessions, so the device gate cannot fire for them.
    expect(gated({ search: '?app', standalone: true }, {})).toBe(false);
    expect(gated({ search: '?app', hostname: 'localhost' }, {})).toBe(false);
    expect(gated({ search: '' }, {})).toBe(false);
    expect(gated({ search: '?landing' }, {})).toBe(false);
  });
});
