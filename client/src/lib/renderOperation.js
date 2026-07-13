import {
  OP_STROKE, OP_ERASE, OP_SHAPE, OP_TEXT,
  SHAPE_RECT, SHAPE_CIRCLE, SHAPE_LINE, SHAPE_TRIANGLE, SHAPE_STAR, SHAPE_DIAMOND,
  BRUSH_SOLID, BRUSH_HIGHLIGHTER, BRUSH_DASHED, BRUSH_DOTTED, BRUSH_CALLIGRAPHY,
  BRUSH_MARKER, BRUSH_BRUSH, BRUSH_NEON, BRUSH_TEXTURED, BRUSH_GRADIENT
} from './operationTypes.js';

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
 * Handles 11 advanced brush styles with dynamics and textures.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').StrokeOp} op
 */
function renderStroke(ctx, op) {
  const pts = op.points;
  if (!pts || pts.length === 0) return;

  const brush = op.brushStyle || BRUSH_SOLID;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;

  // Single tap — draw a dot
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], op.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (brush === BRUSH_HIGHLIGHTER) {
    // Highlighter: translucent, square cap, thicker stroke
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = (op.opacity ?? 1.0) * 0.35;
    ctx.lineWidth = op.lineWidth * 2.2;

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();

  } else if (brush === BRUSH_DASHED) {
    // Dashed: apply line dash
    ctx.setLineDash([op.lineWidth * 2.5, op.lineWidth * 2]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    ctx.setLineDash([]); // reset

  } else if (brush === BRUSH_DOTTED) {
    // Dotted: apply dotted spacing
    ctx.lineCap = 'round';
    ctx.setLineDash([1, op.lineWidth * 2]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    ctx.setLineDash([]); // reset

  } else if (brush === BRUSH_CALLIGRAPHY) {
    // Calligraphy ribbon chaser
    const nib = op.lineWidth * 0.7;
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      ctx.beginPath();
      ctx.moveTo(p1[0] - nib, p1[1] - nib);
      ctx.lineTo(p1[0] + nib, p1[1] + nib);
      ctx.lineTo(p2[0] + nib, p2[1] + nib);
      ctx.lineTo(p2[0] - nib, p2[1] - nib);
      ctx.closePath();
      ctx.fill();
    }

  } else if (brush === BRUSH_MARKER) {
    // Marker: semi-transparent, jittered width (rough paper bleed)
    ctx.lineCap = 'round';
    ctx.globalAlpha = (op.opacity ?? 1.0) * 0.5;
    let prevW = op.lineWidth;
    for (let i = 1; i < pts.length; i++) {
      const targetW = op.lineWidth + (Math.random() - 0.5) * 1.5;
      ctx.lineWidth = Math.max(1, (prevW + targetW) / 2);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      prevW = targetW;
    }

  } else if (brush === BRUSH_BRUSH) {
    // Brush Pen: dynamic tapering based on drawing speed (distance between points)
    let prevW = op.lineWidth;
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const speed = dist / Math.max(1, op.lineWidth * 0.5);
      const multiplier = Math.max(0.2, Math.min(1.8, 1.4 - speed * 0.35));
      const targetW = op.lineWidth * multiplier;

      ctx.lineWidth = (prevW + targetW) / 2;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
      prevW = targetW;
    }

  } else if (brush === BRUSH_NEON) {
    // Neon glow pen (rendered in two steps)
    // Step 1: Thick glowing backdrop
    ctx.save();
    ctx.shadowBlur = op.lineWidth * 2.2;
    ctx.shadowColor = op.color;
    ctx.strokeStyle = op.color;
    ctx.lineWidth = op.lineWidth * 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    ctx.restore();

    // Step 2: Bright neon core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, op.lineWidth * 0.25);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();

  } else if (brush === BRUSH_TEXTURED) {
    // Textured chalk/crayon pen
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const dist = Math.hypot(dx, dy);
      const steps = Math.ceil(dist / 1.5);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = p1[0] + dx * t;
        const cy = p1[1] + dy * t;
        for (let d = 0; d < 3; d++) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * (op.lineWidth / 1.8);
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          ctx.globalAlpha = Math.random() * 0.45;
          ctx.fillRect(px, py, 1.2, 1.2);
        }
      }
    }

  } else if (brush === BRUSH_GRADIENT) {
    // Multi-color rainbow gradient stroke
    for (let i = 1; i < pts.length; i++) {
      const hue = (i * 3.5) % 360;
      ctx.strokeStyle = `hsl(${hue}, 95%, 60%)`;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

  } else {
    // BRUSH_SOLID: standard pen
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i][0] + pts[i + 1][0]) / 2;
      const midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }
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
 * Renders a geometric shape.
 * Supports rect, circle, line, triangle, star, and diamond.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./operationTypes.js').ShapeOp} op
 */
function renderShape(ctx, op) {
  ctx.strokeStyle = op.color;
  ctx.fillStyle   = op.filled ? op.color : 'transparent';

  ctx.beginPath();

  const { x, y, width, height } = op;

  switch (op.shape) {
    case SHAPE_RECT: {
      ctx.roundRect(x, y, width, height, 2);
      break;
    }
    case SHAPE_CIRCLE: {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rx = Math.abs(width / 2);
      const ry = Math.abs(height / 2);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      break;
    }
    case SHAPE_LINE: {
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height);
      break;
    }
    case SHAPE_TRIANGLE: {
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      break;
    }
    case SHAPE_DIAMOND: {
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height / 2);
      ctx.lineTo(x + width / 2, y + height);
      ctx.lineTo(x, y + height / 2);
      ctx.closePath();
      break;
    }
    case SHAPE_STAR: {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const spikes = 5;
      const outerRadius = Math.abs(width / 2);
      const innerRadius = outerRadius * 0.4;
      
      let rot = (Math.PI / 2) * 3;
      let sx = cx;
      let sy = cy;
      const step = Math.PI / spikes;

      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        sx = cx + Math.cos(rot) * outerRadius;
        sy = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(sx, sy);
        rot += step;

        sx = cx + Math.cos(rot) * innerRadius;
        sy = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(sx, sy);
        rot += step;
      }
      ctx.closePath();
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
