import { useRoomStore } from '../../store/roomStore.js';
import { useUndoRedo }  from '../../hooks/useUndoRedo.js';
import { useSocket }    from '../../hooks/useSocket.js';
import {
  ALL_TOOLS, TOOL_PEN, TOOL_ERASER, TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TRIANGLE, TOOL_STAR, TOOL_DIAMOND, TOOL_TEXT,
  BRUSH_SOLID, BRUSH_HIGHLIGHTER, BRUSH_DASHED, BRUSH_DOTTED, BRUSH_CALLIGRAPHY, BRUSH_MARKER, BRUSH_BRUSH, BRUSH_NEON, BRUSH_TEXTURED, BRUSH_GRADIENT
} from '../../lib/operationTypes.js';
import styles from './Toolbar.module.css';

// Tool icons (inline SVG paths for zero dependency)
const TOOL_ICONS = {
  pen:      '✏️',
  eraser:   '⬜',
  rect:     '▭',
  circle:   '○',
  line:     '╱',
  triangle: '▲',
  star:     '★',
  diamond:  '◆',
  text:     'T',
};

const TOOL_LABELS = {
  pen:      'Pen (P)',
  eraser:   'Eraser (E)',
  rect:     'Rectangle (R)',
  circle:   'Circle (C)',
  line:     'Line (L)',
  triangle: 'Triangle (H)',
  star:     'Star (S)',
  diamond:  'Diamond (D)',
  text:     'Text (T)',
};

const PRESET_COLORS = [
  '#1a1a2e', '#ef4444', '#3b82f6', '#22c55e',
  '#f59e0b', '#a855f7', '#06b6d4', '#f97316',
  '#ec4899', '#ffffff',
];

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
            data-tooltip={TOOL_LABELS[t]}
            aria-label={TOOL_LABELS[t]}
            aria-pressed={tool.activeTool === t}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* ── Pen Brush Styles (Conditional) ─────────────────────────── */}
      {tool.activeTool === TOOL_PEN && (
        <>
          <div className={styles.group}>
            <label htmlFor="select-brush" className="visually-hidden">Brush Style</label>
            <select
              id="select-brush"
              value={tool.brushStyle}
              onChange={(e) => setTool({ brushStyle: e.target.value })}
              className={styles.brushSelect}
              aria-label="Brush style"
            >
              <option value={BRUSH_SOLID}>Solid Pen</option>
              <option value={BRUSH_HIGHLIGHTER}>Highlighter</option>
              <option value={BRUSH_DASHED}>Dashed Line</option>
              <option value={BRUSH_DOTTED}>Dotted Line</option>
              <option value={BRUSH_CALLIGRAPHY}>Calligraphy</option>
              <option value={BRUSH_MARKER}>Rough Marker</option>
              <option value={BRUSH_BRUSH}>Brush Pen</option>
              <option value={BRUSH_NEON}>Neon Glow</option>
              <option value={BRUSH_TEXTURED}>Chalk Crayon</option>
              <option value={BRUSH_GRADIENT}>Rainbow Gradient</option>
            </select>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* ── Color picker ─────────────────────────────────────────── */}
      <div className={styles.group}>
        <div className={styles.colorGrid}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={`${styles.colorBtn} ${tool.color === c ? styles.activeColor : ''}`}
              style={{ '--swatch': c }}
              onClick={() => setTool({ color: c })}
              data-tooltip={c}
              aria-label={`Color ${c}`}
              aria-pressed={tool.color === c}
            />
          ))}
        </div>
        {/* Custom color input */}
        <label className={styles.customColorLabel} data-tooltip="Custom color">
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

      {/* ── Stroke width Dropdown ─────────────────────────────────── */}
      <div className={styles.group}>
        <label htmlFor="select-size" className={styles.sizeLabel}>Size</label>
        <select
          id="select-size"
          value={tool.lineWidth}
          onChange={(e) => setTool({ lineWidth: parseInt(e.target.value, 10) })}
          className={styles.sizeSelect}
          aria-label="Stroke width"
        >
          {[2, 4, 6, 8, 12, 16, 24, 32, 40, 50, 64, 80, 100].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      </div>

      <div className={styles.divider} />

      {/* ── Fill toggle (for shapes) ──────────────────────────────── */}
      <div className={styles.group}>
        <button
          className={`${styles.toolBtn} ${tool.filled ? styles.active : ''}`}
          onClick={() => setTool({ filled: !tool.filled })}
          data-tooltip="Toggle shape fill"
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
          data-tooltip="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↩
        </button>
        <button
          id="btn-redo"
          className={styles.actionBtn}
          onClick={redo}
          data-tooltip="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          ↪
        </button>
        <button
          id="btn-clear"
          className={`${styles.actionBtn} ${styles.danger}`}
          onClick={handleClear}
          data-tooltip="Clear board"
          aria-label="Clear board"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
