/**
 * client/src/lib/operationTypes.js
 *
 * Canonical definition of all operation types and their payload shapes.
 *
 * These are pure constants + JSDoc typedefs — no runtime logic.
 * Both the rendering engine and the socket sync hooks depend on this module.
 *
 * Keeping this in one file means changing the schema requires updating exactly
 * one place, and the typedefs serve as inline documentation.
 */

// ── Operation type constants ────────────────────────────────────────────────

/** A freehand polyline drawn with the pen or eraser tool. */
export const OP_STROKE = 'stroke';

/** A geometric shape: rectangle, circle, or line. */
export const OP_SHAPE = 'shape';

/** A text annotation placed on the canvas. */
export const OP_TEXT = 'text';

/** An eraser stroke (same structure as OP_STROKE, rendered in canvas bg color). */
export const OP_ERASE = 'erase';

// ── Shape sub-type constants ────────────────────────────────────────────────
export const SHAPE_RECT   = 'rect';
export const SHAPE_CIRCLE = 'circle';
export const SHAPE_LINE   = 'line';

// ── JSDoc type definitions ─────────────────────────────────────────────────

/**
 * @typedef {Object} BaseOp
 * @property {string} id         - Unique ID (nanoid, client-generated)
 * @property {string} userId     - ID of the creating user
 * @property {string} timestamp  - ISO-8601 string
 * @property {string} color      - Hex color (e.g. "#ef4444")
 * @property {number} lineWidth  - Stroke width in CSS pixels
 * @property {number} opacity    - 0.0 – 1.0
 */

/**
 * @typedef {BaseOp & {
 *   type: 'stroke' | 'erase',
 *   points: [number, number][]
 * }} StrokeOp
 */

/**
 * @typedef {BaseOp & {
 *   type: 'shape',
 *   shape: 'rect' | 'circle' | 'line',
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   filled: boolean
 * }} ShapeOp
 */

/**
 * @typedef {BaseOp & {
 *   type: 'text',
 *   text: string,
 *   x: number,
 *   y: number,
 *   fontSize: number
 * }} TextOp
 */

/** @typedef {StrokeOp | ShapeOp | TextOp} Op */

// ── Tool type constants ─────────────────────────────────────────────────────
export const TOOL_PEN    = 'pen';
export const TOOL_ERASER = 'eraser';
export const TOOL_RECT   = 'rect';
export const TOOL_CIRCLE = 'circle';
export const TOOL_LINE   = 'line';
export const TOOL_TEXT   = 'text';
export const TOOL_SELECT = 'select';

/** All available tools in toolbar order */
export const ALL_TOOLS = [
  TOOL_PEN,
  TOOL_ERASER,
  TOOL_RECT,
  TOOL_CIRCLE,
  TOOL_LINE,
  TOOL_TEXT,
];
