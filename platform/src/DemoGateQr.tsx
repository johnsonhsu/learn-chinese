/**
 * The QR image for the demo device gate (issue #66), split into its OWN lazily-
 * loaded chunk so the from-scratch encoder in utils/qr.ts never lands in the
 * app-shell / installed-PWA critical path — only a gated desktop visitor (who is
 * online by definition) ever downloads it.
 *
 * Renders the matrix as a single inline SVG path (black modules on a paper
 * ground) — no external asset, no canvas, no dependency. If the payload is too
 * large for the encoder (won't happen for the demo URL), we fall back to the
 * plain link the parent already shows, so the panel is never broken.
 */
import { useMemo } from 'react';
import { qrMatrix, qrToSvgPath } from './utils/qr.ts';

export default function DemoGateQr({ url, alt }: { url: string; alt: string }) {
  const svg = useMemo(() => {
    try {
      const { d, size } = qrToSvgPath(qrMatrix(url), 2);
      return { d, size };
    } catch {
      return null; // too large / unsupported — parent's plain link covers it
    }
  }, [url]);

  if (!svg) return null;
  return (
    <svg
      className="demo-gate__qr-svg"
      viewBox={`0 0 ${svg.size} ${svg.size}`}
      role="img"
      aria-label={alt}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={svg.size} height={svg.size} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  );
}
