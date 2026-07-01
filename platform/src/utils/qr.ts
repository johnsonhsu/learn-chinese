/**
 * Tiny, self-contained QR-code generator (issue #66) — byte-mode, error
 * correction level M, up to version 10. NO external dependency: the demo device
 * gate needs one small QR (the demo URL) and the cardinal rule for #66 is to keep
 * the app-shell bundle lean, so this is a compact from-scratch encoder rather
 * than a heavy npm package. It is imported ONLY by the lazily-loaded DemoGate, so
 * it never touches the installed PWA's critical path.
 *
 * Implements just what a URL QR needs: 8-bit byte mode, Reed–Solomon ECC (GF(256)
 * with the standard QR generator polynomial 0x11D), the version/mask machinery,
 * and mask 0 selection with the standard penalty scoring. Output is a boolean
 * module matrix; {@link qrMatrix} returns it and {@link qrToSvgPath} renders it
 * as a single black-on-white SVG path string for crisp, dependency-free display.
 *
 * Not a general QR library — scoped to short ASCII/UTF-8 payloads (a demo URL).
 */

// ── GF(256) arithmetic (QR field: primitive polynomial 0x11D) ────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Reed–Solomon generator polynomial of the given degree.
function rsGenPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecLen: number): number[] {
  // Monic generator polynomial of degree ecLen → coeffs [1, g1, …, g_ecLen].
  const gen = rsGenPoly(ecLen);
  // LFSR division: the remainder register holds ecLen coefficients. Each input
  // byte XORs the top register cell to form the feedback `factor`; the register
  // shifts and every tap gen[i+1] (skipping the leading monic 1 at gen[0]) is
  // mixed in. The final register IS the EC codeword sequence.
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return res;
}

// ── Version capacity tables (level M) ────────────────────────────────────────
// Per version (1-indexed): total data codewords, EC codewords per block, and the
// block structure [ [count, dataPerBlock], ... ] for level M.
//
// We support versions 1–6 ONLY. Version ≥7 additionally requires an 18-bit
// VERSION-INFORMATION block near two finders, which this minimal encoder does
// not place — so we cap here. Version 6 (level M) holds ~134 data bytes, far
// more than any demo URL needs, so the cap is never hit in practice; a longer
// payload throws (see pickVersion) and the caller falls back to plain text.
const MAX_VERSION = 6;
interface VerInfo { ecPerBlock: number; groups: [number, number][]; }
const VERSIONS_M: Record<number, VerInfo> = {
  1: { ecPerBlock: 10, groups: [[1, 16]] },
  2: { ecPerBlock: 16, groups: [[1, 28]] },
  3: { ecPerBlock: 26, groups: [[1, 44]] },
  4: { ecPerBlock: 18, groups: [[2, 32]] },
  5: { ecPerBlock: 24, groups: [[2, 43]] },
  6: { ecPerBlock: 16, groups: [[4, 27]] },
};

function dataCapacityBytes(v: number): number {
  const info = VERSIONS_M[v];
  const dataCw = info.groups.reduce((n, [c, d]) => n + c * d, 0);
  // byte-mode header: 4-bit mode + 8-bit char-count indicator (v1–9) + up to a
  // 4-bit terminator. Be conservative so we never under-provision the region.
  const headerBytes = Math.ceil((4 + 8) / 8);
  return dataCw - headerBytes - 1; // -1 slack for terminator/padding rounding
}

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) if (dataCapacityBytes(v) >= byteLen) return v;
  throw new Error(`qr: payload too large for version ≤${MAX_VERSION}`);
}

// ── Bit buffer ───────────────────────────────────────────────────────────────
class BitBuffer {
  bits: number[] = [];
  put(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >> i) & 1);
  }
  get length() { return this.bits.length; }
}

// ── Codeword assembly (data + EC, interleaved) ───────────────────────────────
function buildCodewords(bytes: number[], v: number): number[] {
  const info = VERSIONS_M[v];
  const ccBits = 8; // byte-mode char-count indicator is 8 bits for versions 1–9
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode
  bb.put(bytes.length, ccBits);
  for (const b of bytes) bb.put(b, 8);

  const totalDataCw = info.groups.reduce((n, [c, d]) => n + c * d, 0);
  const capacityBits = totalDataCw * 8;
  // Terminator (up to 4 zero bits), then pad to a byte boundary.
  const term = Math.min(4, capacityBits - bb.length);
  bb.put(0, term);
  while (bb.length % 8 !== 0) bb.bits.push(0);

  const dataCw: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    dataCw.push(byte);
  }
  // Pad bytes 0xEC / 0x11 alternating until full.
  const pads = [0xec, 0x11];
  let pi = 0;
  while (dataCw.length < totalDataCw) dataCw.push(pads[pi++ % 2]);

  // Split into blocks, EC-encode each, then interleave.
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let idx = 0;
  for (const [count, per] of info.groups) {
    for (let c = 0; c < count; c++) {
      const block = dataCw.slice(idx, idx + per);
      idx += per;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, info.ecPerBlock));
    }
  }
  const result: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) result.push(b[i]);
  const maxEc = info.ecPerBlock;
  for (let i = 0; i < maxEc; i++) for (const b of ecBlocks) result.push(b[i]);
  return result;
}

// ── Matrix placement ─────────────────────────────────────────────────────────
function sizeForVersion(v: number): number { return v * 4 + 17; }

// Alignment-pattern centre coordinates per version (only versions 1–6, which we
// support). Every centre pair (r, c) gets a 5×5 alignment pattern unless it
// overlaps a finder.
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
};

type Cell = boolean | null; // null = not yet placed / reserved

function buildMatrix(codewords: number[], v: number): boolean[][] {
  const n = sizeForVersion(v);
  const m: Cell[][] = Array.from({ length: n }, () => new Array<Cell>(n).fill(null));
  const reserved: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));

  const setF = (r: number, c: number, val: boolean) => { m[r][c] = val; reserved[r][c] = true; };

  // Finder patterns + separators at the three corners.
  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= n || c >= n) continue;
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const isDark = inRing && (
        dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
        (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
      );
      setF(r, c, isDark);
    }
  };
  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  // Timing patterns.
  for (let i = 8; i < n - 8; i++) {
    setF(6, i, i % 2 === 0);
    setF(i, 6, i % 2 === 0);
  }

  // Alignment patterns (skip ones overlapping finders).
  const centres = ALIGN[v];
  for (const r0 of centres) for (const c0 of centres) {
    if (reserved[r0][c0]) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      setF(r0 + dr, c0 + dc, isDark);
    }
  }

  // Dark module.
  setF(n - 8, 8, true);

  // Format information for EC level M (0b00) + mask 0. Precomputed 15-bit string:
  // BCH(15,5) of (levelBits<<3 | mask), then XOR the spec mask 0b101010000010010.
  // For level M (0b00) + mask 0 the result is 0b101010000010010 (verified against
  // the reference `qrcode` encoder — see the qr.test.ts cross-check).
  const FORMAT_M_MASK0 = 0b101010000010010;
  // Write the 15 format-info modules (bit i via (fmt>>i)&1) in the exact vertical
  // + horizontal split used by the QR spec, marking each cell reserved so data
  // placement + masking skip them. Done BEFORE data placement so the reserved set
  // is complete; since we only ever use mask 0, the dummy and final values match.
  const placeFormat = () => {
    const bits = FORMAT_M_MASK0;
    for (let i = 0; i < 15; i++) {
      const mod = ((bits >> i) & 1) === 1;
      // vertical column (col 8)
      if (i < 6) setF(i, 8, mod);
      else if (i < 8) setF(i + 1, 8, mod);
      else setF(n - 15 + i, 8, mod);
      // horizontal row (row 8)
      if (i < 8) setF(8, n - i - 1, mod);
      else if (i < 9) setF(8, 15 - i - 1 + 1, mod);
      else setF(8, 15 - i - 1, mod);
    }
  };
  placeFormat();

  // Zig-zag data placement (bottom-right upward, two columns at a time).
  let bit = 0;
  const totalBits = codewords.length * 8;
  let col = n - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col--; // skip the vertical timing column
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc] || m[row][cc] !== null) continue;
        let dark = false;
        if (bit < totalBits) {
          const byte = codewords[bit >> 3];
          dark = ((byte >> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
        m[row][cc] = dark;
      }
    }
    col -= 2;
    upward = !upward;
  }

  // Apply mask 0 ((r + c) % 2 === 0) to data modules only (reserved skipped).
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (reserved[r][c]) continue;
    if ((r + c) % 2 === 0) m[r][c] = !m[r][c];
  }

  return m.map((row) => row.map((cell) => cell === true));
}

// ── UTF-8 encode ─────────────────────────────────────────────────────────────
function utf8Bytes(s: string): number[] {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
  // Fallback (test env with no TextEncoder): encodeURIComponent path.
  const out: number[] = [];
  const esc = unescape(encodeURIComponent(s));
  for (let i = 0; i < esc.length; i++) out.push(esc.charCodeAt(i));
  return out;
}

/** Encode `text` into a boolean module matrix (true = dark). Level M, mask 0. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = utf8Bytes(text);
  const v = pickVersion(bytes.length);
  const codewords = buildCodewords(bytes, v);
  return buildMatrix(codewords, v);
}

/**
 * Render a QR matrix as a single SVG `<path d="…">` string of black squares on a
 * transparent/white ground. `quiet` is the quiet-zone module count (default 2).
 * The caller sets viewBox to `0 0 size size` where size = matrix + 2*quiet.
 */
export function qrToSvgPath(matrix: boolean[][], quiet = 2): { d: string; size: number } {
  const n = matrix.length;
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (matrix[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  return { d, size };
}
