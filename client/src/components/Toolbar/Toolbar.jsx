/**
 * client/src/components/Toolbar/Toolbar.jsx
 *
 * Floating toolbar with tool buttons, color picker, stroke width, and actions.
 */

import { useRoomStore } from '../../store/roomStore.js';
import { useUndoRedo }  from '../../hooks/useUndoRedo.js';
import { useSocket }    from '../../hooks/useSocket.js';
import { ALL_TOOLS, TOOL_PEN, TOOL_ERASER, TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TEXT } from '../../lib/operationTypes.js';
import styles from './Toolbar.module.css';

// Tool icons (inline SVG paths for zero dependency)
const TOOL_ICONS = {
  pen:    '✏️',
  eraser: '⬜',
  rect:   '▭',
  circle: '○',
  line:   '╱',
  text:   'T',
};

const TOOL_LABELS = {
  pen:    'Pen (P)',
  eraser: 'Eraser (E)',
  rect:   'Rectangle (R)',
  circle: 'Circle (C)',
  line:   'Line (L)',
  text:   'Text (T)',
};

const PRESET_COLORS = [
  '#1a1a2e', '#ef4444', '#3b82f6', '#22c55e',
  '#f59e0b', '#a855f7', '#06b6d4', '#f97316',
  '#ec4899', '#ffffff',
];

const STROKE_WIDTHS = [2, 4, 8, 16];

export function Toolbar() {
  const tool     = useRoomStore((s) => s.tool);
  const setTool  = useRoomStore((s) => s.setTool);
  const roomId   = useRoomStore((s) => s.roomId);
  const userId   = useRoomStore((s) => s.userId);
  const socket   = useSocket();
  const { undo, redo } = useUndoRedo();

  const handleClear = () => {
    if (!window.confirm('Clear the entire board? This cannot be undone.')) return;
    socket.emit('board:clear', { roomId, userId });
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Drawing tools">
      {/* ── Drawing tools ────────────────────────────────────────── */}
      <div className={styles.group}>
        {ALL_TOOLS.map((t) => (
          <button
            key={t}
            id={`tool-${t}`}
            className={`${styles.toolBtn} ${tool.activeTool === t ? styles.active : ''}`}
            onClick={() => setTool({ activeTool: t })}
            title={TOOL_LABELS[t]}
            aria-label={TOOL_LABELS[t]}
            aria-pressed={tool.activeTool === t}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* ── Color picker ─────────────────────────────────────────── */}
      <div className={styles.group}>
        <div className={styles.colorGrid}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.colorBtn} ${tool.color === c ? styles.activeColor : ''}`}
              style={{ '--swatch': c }}
              onClick={() => setTool({ color: c })}
              title={c}
              aria-label={`Color ${c}`}
              aria-pressed={tool.color === c}
            />
          ))}
        </div>
        {/* Custom color input */}
        <label className={styles.customColorLabel} title="Custom color">
          <input
            type="color"
            value={tool.color}
            onChange={(e) => setTool({ color: e.target.value })}
            className={styles.customColorInput}
            aria-label="Custom color picker"
          />
          🎨
        </label>
      </div>

      <div className={styles.divider} />

      {/* ── Stroke width ─────────────────────────────────────────── */}
      <div className={styles.group}>
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            className={`${styles.widthBtn} ${tool.lineWidth === w ? styles.active : ''}`}
            onClick={() => setTool({ lineWidth: w })}
            title={`Stroke width: ${w}px`}
            aria-label={`Stroke width ${w} pixels`}
            aria-pressed={tool.lineWidth === w}
          >
            <div className={styles.widthDot} style={{ width: w + 4, height: w + 4 }} />
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* ── Fill toggle (for shapes) ──────────────────────────────── */}
      <div className={styles.group}>
        <button
          className={`${styles.toolBtn} ${tool.filled ? styles.active : ''}`}
          onClick={() => setTool({ filled: !tool.filled })}
          title="Toggle shape fill"
          aria-label="Toggle shape fill"
          aria-pressed={tool.filled}
        >
          ▪
        </button>
      </div>

      <div className={styles.divider} />

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className={styles.group}>
        <button
          id="btn-undo"
          className={styles.actionBtn}
          onClick={undo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↩
        </button>
        <button
          id="btn-redo"
          className={styles.actionBtn}
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          ↪
        </button>
        <button
          id="btn-clear"
          className={`${styles.actionBtn} ${styles.danger}`}
          onClick={handleClear}
          title="Clear board"
          aria-label="Clear board"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
