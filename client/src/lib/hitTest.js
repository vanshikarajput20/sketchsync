/**
 * client/src/lib/hitTest.js
 *
 * Geometry utility for pointer hit-testing against strokes and shapes.
 */

export function hitTestOp(op, x, y) {
  const tolerance = 15; // px distance tolerance for lines and strokes

  if (op.type === 'shape') {
    const { shape, x: sx, y: sy, width: sw, height: sh } = op;
    const xMin = Math.min(sx, sx + sw);
    const xMax = Math.max(sx, sx + sw);
    const yMin = Math.min(sy, sy + sh);
    const yMax = Math.max(sy, sy + sh);

    if (shape === 'line' || shape === 'arrow') {
      return distToSegment({ x, y }, { x: sx, y: sy }, { x: sx + sw, y: sy + sh }) < tolerance;
    }

    return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
  }

  if (op.type === 'stroke' || op.type === 'erase') {
    if (!op.points || op.points.length === 0) return false;
    for (const pt of op.points) {
      const dx = pt[0] - x;
      const dy = pt[1] - y;
      if (dx * dx + dy * dy < tolerance * tolerance) {
        return true;
      }
    }
    return false;
  }

  if (op.type === 'text') {
    const w = (op.text.length * (op.fontSize ?? 18)) * 0.6;
    const h = (op.fontSize ?? 18) * 1.5;
    return x >= op.x && x <= op.x + w && y >= op.y && y <= op.y + h;
  }

  return false;
}

function distToSegment(p, v, w) {
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
}

function dist2(v, w) {
  return (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
}
