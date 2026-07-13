import { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../../store/roomStore.js';
import { useUndoRedo }  from '../../hooks/useUndoRedo.js';
import { useSocket }    from '../../hooks/useSocket.js';
import {
  TOOL_PEN, TOOL_ERASER, TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TRIANGLE, TOOL_STAR, TOOL_DIAMOND, TOOL_TEXT,
  BRUSH_SOLID, BRUSH_HIGHLIGHTER, BRUSH_DASHED, BRUSH_DOTTED, BRUSH_CALLIGRAPHY, BRUSH_MARKER, BRUSH_BRUSH, BRUSH_NEON, BRUSH_TEXTURED, BRUSH_GRADIENT
} from '../../lib/operationTypes.js';
import styles from './Toolbar.module.css';

const PRIMARY_TOOLS = [TOOL_PEN, TOOL_ERASER, 'shape', TOOL_TEXT];

const SHAPES = [TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TRIANGLE, TOOL_STAR, TOOL_DIAMOND];

const SHAPE_ICONS = {
  rect:     '▭',
  circle:   '○',
  line:     '╱',
  triangle: '▲',
  star:     '★',
  diamond:  '◆',
};

const SHAPE_LABELS = {
  rect:     'Rectangle',
  circle:   'Circle',
  line:     'Line',
  triangle: 'Triangle',
  star:     'Star',
  diamond:  'Diamond',
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

  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef(null);
  const lastShape = useRef(TOOL_RECT);

  // Close size dropdown on clicking outside
  useEffect(() => {
    const clickOutside = (e) => {
      if (sizeRef.current && !sizeRef.current.contains(e.target)) {
        setSizeOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  // Update last active shape when selected
  const isShapeActive = SHAPES.includes(tool.activeTool);
  if (isShapeActive && tool.activeTool !== lastShape.current) {
    lastShape.current = tool.activeTool;
  }

  const handleClear = () => {
    if (!window.confirm('Clear the entire board? This cannot be undone.')) return;
    socket.emit('board:clear', { roomId, userId });
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Drawing tools">
      {/* ── Primary Drawing tools ─────────────────────────────────── */}
      <div className={styles.group}>
        {PRIMARY_TOOLS.map((t) => {
          let isActive = false;
          let onClick = () => setTool({ activeTool: t });
          let icon = '';
          let label = '';
          let id = `tool-${t}`;

          if (t === 'shape') {
            isActive = isShapeActive;
            icon = SHAPE_ICONS[lastShape.current];
            label = `Shapes (${SHAPE_LABELS[lastShape.current]})`;
            onClick = () => setTool({ activeTool: lastShape.current });
            id = `tool-shape`;
          } else {
            isActive = tool.activeTool === t;
            if (t === TOOL_PEN) {
              icon = '✏️';
              label = 'Pen (P)';
            } else if (t === TOOL_ERASER) {
              icon = '⬜';
              label = 'Eraser (E)';
            } else if (t === TOOL_TEXT) {
              icon = 'T';
              label = 'Text (T)';
            }
          }

          return (
            <button
              key={t}
              id={id}
              className={`${styles.toolBtn} ${isActive ? styles.active : ''}`}
              onClick={onClick}
              data-tooltip={label}
              aria-label={label}
              aria-pressed={isActive}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <div className={styles.divider} />

      {/* ── Shape Sub-Type Dropdown (Conditional) ──────────────────── */}
      {isShapeActive && (
        <>
          <div className={styles.group}>
            <label htmlFor="select-shape" className="visually-hidden">Choose Shape</label>
            <select
              id="select-shape"
              value={tool.activeTool}
              onChange={(e) => {
                lastShape.current = e.target.value;
                setTool({ activeTool: e.target.value });
              }}
              className={styles.brushSelect}
              aria-label="Choose shape"
            >
              {SHAPES.map((sh) => (
                <option key={sh} value={sh}>
                  {SHAPE_LABELS[sh]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.divider} />
        </>
      )}

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

      {/* ── Custom Stroke Width (Visual dots preview) ────────────── */}
      <div className={styles.group} ref={sizeRef}>
        <div className={styles.customSelect}>
          <button
            className={styles.sizeTrigger}
            onClick={() => setSizeOpen(!sizeOpen)}
            data-tooltip={`Line width: ${tool.lineWidth}px`}
            aria-label="Stroke width picker"
            aria-expanded={sizeOpen}
          >
            <div 
              className={styles.sizePreviewCircle} 
              style={{ 
                width: Math.max(2, Math.min(18, tool.lineWidth)), 
                height: Math.max(2, Math.min(18, tool.lineWidth)) 
              }} 
            />
            <span className={styles.sizeText}>{tool.lineWidth}px</span>
            <span className={styles.arrow}>▼</span>
          </button>
          
          {sizeOpen && (
            <div className={styles.sizeMenu}>
              {[2, 4, 6, 8, 12, 16, 24, 32, 40, 50, 64, 80, 100].map((w) => (
                <button
                  key={w}
                  className={`${styles.sizeOption} ${tool.lineWidth === w ? styles.activeSize : ''}`}
                  onClick={() => {
                    setTool({ lineWidth: w });
                    setSizeOpen(false);
                  }}
                  aria-label={`Select ${w} pixels width`}
                >
                  <div className={styles.optionCircleWrapper}>
                    <div 
                      className={styles.optionCircle} 
                      style={{ 
                        width: Math.max(2, Math.min(18, w)), 
                        height: Math.max(2, Math.min(18, w)) 
                      }} 
                    />
                  </div>
                  <span className={styles.optionText}>{w}px</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
