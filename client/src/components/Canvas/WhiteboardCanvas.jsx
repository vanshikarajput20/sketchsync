/**
 * client/src/components/Canvas/WhiteboardCanvas.jsx
 *
 * The main canvas component. Renders two stacked <canvas> elements:
 *
 *   1. Committed layer (bottom)  — all finalized, server-acknowledged operations.
 *      Rebuilt by replaying all ops through renderOperation() on undo/redo/clear.
 *
 *   2. Live layer (top, transparent)  — in-progress stroke preview + remote cursors.
 *      Cleared and redrawn on every pointer-move. Also renders remote user cursors.
 *
 * Why two layers?
 *   If we drew in-progress strokes on the committed layer, we'd need to clear and
 *   redraw all ops on every mouse-move frame — O(n) work per frame. With a separate
 *   live layer we pay O(1) for the preview and O(n) only on pointer-up.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useRoomStore } from '../../store/roomStore.js';
import { renderOperation, replayOperations } from '../../lib/renderOperation.js';
import { useDrawing } from './useDrawing.js';
import { useSync } from './useSync.js';
import { TOOL_TEXT } from '../../lib/operationTypes.js';
import styles from './WhiteboardCanvas.module.css';

const CANVAS_WIDTH  = 3840; // 4K internal resolution for high-DPI screens
const CANVAS_HEIGHT = 2160;

/**
 * @param {{ committedCanvasRef?: React.RefObject<HTMLCanvasElement> }} props
 */
export function WhiteboardCanvas({ committedCanvasRef: externalRef } = {}) {
  const internalRef  = useRef(null);
  // Prefer the externally-supplied ref (for export button access), else use internal
  const committedRef = externalRef || internalRef;
  const liveRef      = useRef(null);
  const textInputRef = useRef(null);

  const operations = useRoomStore((s) => s.operations);
  const cursors    = useRoomStore((s) => s.cursors);
  const users      = useRoomStore((s) => s.users);
  const activeTool = useRoomStore((s) => s.tool.activeTool);

  // ── Text tool overlay state ────────────────────────────────────────────────
  const [textInput, setTextInput] = useState(null); // { x, y, canvasX, canvasY }

  // ── Redraw callback (called by useSync on undo/redo/clear) ─────────────────
  const redrawCommitted = useCallback(() => {
    const canvas = committedRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!ctx) return;
    replayOperations(ctx, canvas, operations);
  }, [operations]);

  // ── Wire up socket sync ────────────────────────────────────────────────────
  useSync({ onRedrawNeeded: redrawCommitted });

  // ── Wire up drawing handlers ───────────────────────────────────────────────
  const { onPointerDown, onPointerMove, onPointerUp, commitText } = useDrawing({
    committedCanvasRef: committedRef,
    liveCanvasRef:      liveRef,
  });

  // ── Incrementally render newly added operations ────────────────────────────
  // When a new op is appended (from a remote user or after undo replay), render it.
  const lastRenderedCount = useRef(0);
  useEffect(() => {
    const ctx    = committedRef.current?.getContext('2d');
    const canvas = committedRef.current;
    if (!ctx || !canvas) return;

    if (operations.length < lastRenderedCount.current) {
      // Operations array shrank (undo) — full replay needed
      replayOperations(ctx, canvas, operations);
      lastRenderedCount.current = operations.length;
    } else {
      // Append new ops only
      for (let i = lastRenderedCount.current; i < operations.length; i++) {
        renderOperation(ctx, operations[i]);
      }
      lastRenderedCount.current = operations.length;
    }
  }, [operations]);

  // ── Render remote cursors on live layer ───────────────────────────────────
  useEffect(() => {
    const liveCtx = liveRef.current?.getContext('2d');
    const canvas  = liveRef.current;
    if (!liveCtx || !canvas) return;

    // Clear the cursor layer (but not the in-progress stroke — that's handled
    // by useDrawing, which clears only when drawing). We use requestAnimationFrame
    // to batch cursor draws and avoid fighting with useDrawing's clearLive calls.
    const rafId = requestAnimationFrame(() => {
      // Only clear the area used by cursors (overlay) — don't clear the whole live canvas
      // We do a full clear here because cursors can be anywhere.
      // In-progress strokes are redrawn by useDrawing after the clear.
      // This is safe because cursors and strokes are mutually exclusive:
      // while drawing, cursor updates for OTHER users still fire,
      // but we accept this minor flicker trade-off for simplicity.
      liveCtx.clearRect(0, 0, canvas.width, canvas.height);

      cursors.forEach((pos, uid) => {
        const user = users.get(uid);
        if (!user) return;
        drawRemoteCursor(liveCtx, pos.x, pos.y, user.color, user.displayName);
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [cursors, users]);

  // ── Text tool click handler ────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (activeTool !== TOOL_TEXT) return;

    const canvas  = liveRef.current;
    const rect    = canvas.getBoundingClientRect();
    const scaleX  = canvas.width  / rect.width;
    const scaleY  = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top)  * scaleY;

    // Show text input overlay at click position (CSS coordinates)
    setTextInput({
      x:       e.clientX - rect.left,
      y:       e.clientY - rect.top,
      canvasX,
      canvasY,
    });

    setTimeout(() => textInputRef.current?.focus(), 0);
  }, [activeTool]);

  const handleTextCommit = useCallback(() => {
    if (!textInput || !textInputRef.current) return;
    const text = textInputRef.current.value;
    commitText(text, { x: textInput.canvasX, y: textInput.canvasY });
    setTextInput(null);
  }, [textInput, commitText]);

  const getCursorStyle = () => {
    switch (activeTool) {
      case TOOL_TEXT:    return 'text';
      case 'eraser':     return 'cell';
      default:           return 'crosshair';
    }
  };

  return (
    <div className={styles.canvasContainer}>
      {/* Committed layer — all finalized ops */}
      <canvas
        ref={committedRef}
        className={styles.committedCanvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-label="Whiteboard drawing surface"
      />

      {/* Live layer — in-progress preview + remote cursors */}
      <canvas
        ref={liveRef}
        className={styles.liveCanvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ cursor: getCursorStyle() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={handleCanvasClick}
        aria-hidden="true"
      />

      {/* Text tool overlay input */}
      {textInput && (
        <input
          ref={textInputRef}
          className={styles.textInput}
          style={{ left: textInput.x, top: textInput.y }}
          type="text"
          placeholder="Type and press Enter…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTextCommit();
            if (e.key === 'Escape') setTextInput(null);
          }}
          onBlur={handleTextCommit}
          aria-label="Text input for whiteboard annotation"
        />
      )}
    </div>
  );
}

// ── Remote cursor renderer ────────────────────────────────────────────────────

/**
 * Draws a remote user's cursor as a colored arrow + name label.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {string} name
 */
function drawRemoteCursor(ctx, x, y, color, name) {
  ctx.save();

  // Cursor arrow (simple triangle)
  ctx.fillStyle   = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 2;

  ctx.beginPath();
  ctx.moveTo(x,       y);
  ctx.lineTo(x + 12,  y + 20);
  ctx.lineTo(x + 5,   y + 16);
  ctx.lineTo(x + 2,   y + 24);
  ctx.lineTo(x - 2,   y + 20);
  ctx.lineTo(x + 2,   y + 16);
  ctx.lineTo(x - 6,   y + 18);
  ctx.closePath();

  // Use a simpler arrow shape
  ctx.beginPath();
  ctx.moveTo(x,      y);
  ctx.lineTo(x + 14, y + 22);
  ctx.lineTo(x + 5,  y + 17);
  ctx.lineTo(x,      y + 30);
  ctx.lineTo(x - 5,  y + 17);
  ctx.lineTo(x - 14, y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Name label pill
  ctx.font         = 'bold 22px Inter, sans-serif';
  ctx.textBaseline = 'top';
  const textWidth  = ctx.measureText(name).width;
  const padding    = 12;
  const pillX      = x + 16;
  const pillY      = y + 24;
  const pillW      = textWidth + padding * 2;
  const pillH      = 34;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 8);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, pillX + padding, pillY + 6);

  ctx.restore();
}
