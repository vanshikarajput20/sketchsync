/**
 * client/src/lib/renderOperation.js
 *
 * Pure function that draws a single operation onto a Canvas 2D context.
 *
 * Design principles:
 * - PURE: takes (ctx, op) and has no side effects beyond drawing. No state.
 * - IDEMPOTENT: calling it twice with the same arguments draws the same thing.
 * - TESTABLE: because it's pure, it can be tested with a mock canvas context.
 *
 * This is the CORE rendering function. The canvas is rebuilt by replaying
 * all operations through this function, which is how undo/redo works.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').Op} op
 */

import { OP_STROKE, OP_ERASE, OP_SHAPE, OP_TEXT, SHAPE_RECT, SHAPE_CIRCLE, SHAPE_LINE } from './operationTypes.js';

export function renderOperation(ctx, op) {
  ctx.save();

  // Apply shared style properties
  ctx.globalAlpha = op.opacity ?? 1.0;
  ctx.lineWidth   = op.lineWidth ?? 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  switch (op.type) {
    case OP_STROKE:
      renderStroke(ctx, op);
      break;
    case OP_ERASE:
      renderErase(ctx, op);
      break;
    case OP_SHAPE:
      renderShape(ctx, op);
      break;
    case OP_TEXT:
      renderText(ctx, op);
      break;
    default:
      console.warn('[renderOperation] Unknown op type:', op.type);
  }

  ctx.restore();
}

// ── Private renderers ────────────────────────────────────────────────────────

/**
 * Renders a freehand polyline stroke.
 * Uses quadratic Bézier smoothing between points for a natural feel.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').StrokeOp} op
 */
function renderStroke(ctx, op) {
  const pts = op.points;
  if (!pts || pts.length === 0) return;

  ctx.strokeStyle = op.color;
  ctx.beginPath();

  if (pts.length === 1) {
    // Single tap — draw a dot
    ctx.arc(pts[0][0], pts[0][1], op.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = op.color;
    ctx.fill();
    return;
  }

  ctx.moveTo(pts[0][0], pts[0][1]);

  // Quadratic bezier smoothing: midpoint between consecutive points
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i][0] + pts[i + 1][0]) / 2;
    const midY = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
  }

  // Last point
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

/**
 * Renders an eraser stroke using destination-out compositing.
 * This permanently removes pixels rather than painting white on top,
 * which works correctly even on a transparent background.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').StrokeOp} op
 */
function renderErase(ctx, op) {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)';
  ctx.lineWidth = op.lineWidth * 4; // Eraser is wider than the pen

  const pts = op.points;
  if (!pts || pts.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();

  // Reset composite operation (ctx.restore() will handle this, but explicit is clearer)
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Renders a geometric shape (rect, circle, or line).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').ShapeOp} op
 */
function renderShape(ctx, op) {
  ctx.strokeStyle = op.color;
  ctx.fillStyle   = op.filled ? op.color : 'transparent';

  ctx.beginPath();

  switch (op.shape) {
    case SHAPE_RECT: {
      const { x, y, width, height } = op;
      ctx.roundRect(x, y, width, height, 2);
      break;
    }
    case SHAPE_CIRCLE: {
      // Stored as bounding box (x, y, width, height) — draw as ellipse
      const cx = op.x + op.width / 2;
      const cy = op.y + op.height / 2;
      const rx = Math.abs(op.width / 2);
      const ry = Math.abs(op.height / 2);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      break;
    }
    case SHAPE_LINE: {
      ctx.moveTo(op.x, op.y);
      ctx.lineTo(op.x + op.width, op.y + op.height);
      break;
    }
    default:
      console.warn('[renderOperation] Unknown shape type:', op.shape);
      return;
  }

  if (op.filled && op.shape !== SHAPE_LINE) {
    ctx.fill();
  }
  ctx.stroke();
}

/**
 * Renders a text annotation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').TextOp} op
 */
function renderText(ctx, op) {
  ctx.fillStyle = op.color;
  ctx.font = `${op.fontSize ?? 18}px Inter, sans-serif`;
  ctx.textBaseline = 'top';
  // Support multi-line text split by newlines
  const lines = op.text.split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(line, op.x, op.y + i * (op.fontSize ?? 18) * 1.4);
  });
}

/**
 * Replays an array of operations onto a canvas context in order.
 * Used to rebuild the canvas from scratch (e.g., after undo).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement}        canvas
 * @param {import('./operationTypes.js').Op[]} operations
 */
export function replayOperations(ctx, canvas, operations) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const op of operations) {
    renderOperation(ctx, op);
  }
}
