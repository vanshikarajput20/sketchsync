/**
 * client/src/components/Canvas/useDrawing.js
 *
 * Handles pointer (mouse + touch) input to produce drawing operations.
 *
 * Responsibilities:
 *   1. Convert raw pointer events into tool-appropriate data (points, shape bounds, text).
 *   2. Render in-progress strokes on the live canvas layer (fast, no socket involved).
 *   3. On pointer-up, finalize the operation, emit it via socket, and add to store.
 *   4. Throttle cursor:move broadcasts to ≤ 20 events/sec.
 *
 * The "live layer" (overlaid transparent canvas) shows in-progress drawing
 * without affecting the committed layer. On pointer-up, the live layer is
 * cleared and the finalized op is rendered on the committed layer via store.
 */

import { useRef, useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useSocket } from '../../hooks/useSocket.js';
import { useRoomStore } from '../../store/roomStore.js';
import { useUndoRedo } from '../../hooks/useUndoRedo.js';
import {
  TOOL_PEN, TOOL_ERASER, TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TEXT,
  OP_STROKE, OP_ERASE, OP_SHAPE, OP_TEXT,
  SHAPE_RECT, SHAPE_CIRCLE, SHAPE_LINE,
} from '../../lib/operationTypes.js';
import { renderOperation } from '../../lib/renderOperation.js';

const CURSOR_THROTTLE_MS = 50; // 20 events/sec

/**
 * @param {{
 *   committedCanvasRef: React.RefObject<HTMLCanvasElement>,
 *   liveCanvasRef:      React.RefObject<HTMLCanvasElement>,
 * }} refs
 */
export function useDrawing({ committedCanvasRef, liveCanvasRef }) {
  const socket     = useSocket();
  const { pushOpId } = useUndoRedo();

  const roomId  = useRoomStore((s) => s.roomId);
  const userId  = useRoomStore((s) => s.userId);
  const tool    = useRoomStore((s) => s.tool);
  const addOp   = useRoomStore((s) => s.addOperation);

  // ── Drawing state ──────────────────────────────────────────────────────────
  const isDrawing       = useRef(false);
  const currentPoints   = useRef([]); // for stroke/erase
  const shapeStart      = useRef({ x: 0, y: 0 }); // for shape tools
  const lastCursorEmit  = useRef(0);

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  const getCanvasPos = useCallback((e) => {
    const canvas = liveCanvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }, [liveCanvasRef]);

  // ── Cursor broadcast (throttled) ───────────────────────────────────────────
  const emitCursor = useCallback((x, y) => {
    const now = Date.now();
    if (now - lastCursorEmit.current < CURSOR_THROTTLE_MS) return;
    lastCursorEmit.current = now;
    socket.emit('cursor:move', { roomId, userId, x, y });
  }, [socket, roomId, userId]);

  // ── Live layer helpers ────────────────────────────────────────────────────
  const getLiveCtx = useCallback(() => liveCanvasRef.current?.getContext('2d'), [liveCanvasRef]);
  const clearLive  = useCallback(() => {
    const canvas = liveCanvasRef.current;
    if (canvas) getLiveCtx()?.clearRect(0, 0, canvas.width, canvas.height);
  }, [getLiveCtx, liveCanvasRef]);

  // ── Build a complete op object from current tool state ────────────────────
  const buildOp = useCallback((overrides = {}) => {
    const base = {
      id:        nanoid(12),
      userId,
      timestamp: new Date().toISOString(),
      color:     tool.color,
      lineWidth: tool.lineWidth,
      opacity:   tool.opacity,
    };
    return { ...base, ...overrides };
  }, [userId, tool]);

  // ── Pointer down ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (!roomId) return;
    e.preventDefault();
    isDrawing.current = true;
    const { x, y } = getCanvasPos(e);

    if (tool.activeTool === TOOL_PEN || tool.activeTool === TOOL_ERASER) {
      currentPoints.current = [[x, y]];
    } else if (
      tool.activeTool === TOOL_RECT ||
      tool.activeTool === TOOL_CIRCLE ||
      tool.activeTool === TOOL_LINE
    ) {
      shapeStart.current = { x, y };
    } else if (tool.activeTool === TOOL_TEXT) {
      // Text tool: show a native input at the canvas position
      // handled separately by the text input overlay
    }
  }, [roomId, tool, getCanvasPos]);

  // ── Pointer move ──────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e) => {
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    emitCursor(x, y);

    if (!isDrawing.current) return;

    const liveCtx = getLiveCtx();
    if (!liveCtx) return;
    clearLive();

    if (tool.activeTool === TOOL_PEN || tool.activeTool === TOOL_ERASER) {
      currentPoints.current.push([x, y]);
      // Preview on live layer
      const previewOp = buildOp({
        type:   tool.activeTool === TOOL_ERASER ? OP_ERASE : OP_STROKE,
        points: currentPoints.current,
      });
      renderOperation(liveCtx, previewOp);
    } else {
      // Shape preview
      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;
      const shapeTypeMap = { [TOOL_RECT]: SHAPE_RECT, [TOOL_CIRCLE]: SHAPE_CIRCLE, [TOOL_LINE]: SHAPE_LINE };
      const previewOp = buildOp({
        type:   OP_SHAPE,
        shape:  shapeTypeMap[tool.activeTool],
        x:      Math.min(sx, x),
        y:      Math.min(sy, y),
        width:  Math.abs(x - sx),
        height: Math.abs(y - sy),
        filled: tool.filled,
      });
      renderOperation(liveCtx, previewOp);
    }
  }, [tool, getCanvasPos, getLiveCtx, clearLive, emitCursor, buildOp]);

  // ── Pointer up ────────────────────────────────────────────────────────────
  const onPointerUp = useCallback((e) => {
    if (!isDrawing.current || !roomId) return;
    isDrawing.current = false;
    clearLive();

    const { x, y } = getCanvasPos(e);
    let op;

    if (tool.activeTool === TOOL_PEN) {
      if (currentPoints.current.length === 0) return;
      op = buildOp({ type: OP_STROKE, points: currentPoints.current });
    } else if (tool.activeTool === TOOL_ERASER) {
      if (currentPoints.current.length === 0) return;
      op = buildOp({ type: OP_ERASE, points: currentPoints.current });
    } else {
      const sx = shapeStart.current.x;
      const sy = shapeStart.current.y;
      // Ignore tiny accidental clicks (< 5px)
      if (Math.abs(x - sx) < 5 && Math.abs(y - sy) < 5) return;
      const shapeTypeMap = { [TOOL_RECT]: SHAPE_RECT, [TOOL_CIRCLE]: SHAPE_CIRCLE, [TOOL_LINE]: SHAPE_LINE };
      op = buildOp({
        type:   OP_SHAPE,
        shape:  shapeTypeMap[tool.activeTool],
        x:      Math.min(sx, x),
        y:      Math.min(sy, y),
        width:  Math.abs(x - sx),
        height: Math.abs(y - sy),
        filled: tool.filled,
      });
    }

    if (!op) return;

    // 1. Render op on committed layer immediately (optimistic)
    const committedCtx = committedCanvasRef.current?.getContext('2d');
    if (committedCtx) renderOperation(committedCtx, op);

    // 2. Add to store
    addOp(op);

    // 3. Push to undo stack
    pushOpId(op.id);

    // 4. Emit to server
    socket.emit('draw:operation', { roomId, op });

    currentPoints.current = [];
  }, [roomId, tool, getCanvasPos, buildOp, clearLive, addOp, pushOpId, socket, committedCanvasRef]);

  /**
   * Handles text tool submission from the overlay input.
   * Called by WhiteboardCanvas when the user presses Enter or clicks away.
   *
   * @param {string} text
   * @param {{ x: number, y: number }} position - Canvas coordinates
   */
  const commitText = useCallback((text, position) => {
    if (!text.trim() || !roomId) return;
    const op = buildOp({
      type:     OP_TEXT,
      text:     text.trim(),
      x:        position.x,
      y:        position.y,
      fontSize: tool.fontSize,
    });

    const committedCtx = committedCanvasRef.current?.getContext('2d');
    if (committedCtx) renderOperation(committedCtx, op);
    addOp(op);
    pushOpId(op.id);
    socket.emit('draw:operation', { roomId, op });
  }, [roomId, tool.fontSize, buildOp, addOp, pushOpId, socket, committedCanvasRef]);

  return { onPointerDown, onPointerMove, onPointerUp, commitText };
}
