import { describe, it, expect } from 'vitest';
import { evaluateDemoMode, type DemoModeEnv } from '../demo-mode.ts';

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
