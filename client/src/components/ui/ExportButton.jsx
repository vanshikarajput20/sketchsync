/**
 * client/src/components/ui/ExportButton.jsx
 *
 * Export board as PNG or SVG. Accesses the committed canvas via a DOM ref
 * passed down from Room.jsx.
 */

import { useState } from 'react';
import { exportAsPNG, exportAsSVG } from '../../lib/exportCanvas.js';
import styles from './ExportButton.module.css';

export function ExportButton({ committedCanvasRef }) {
  const [open, setOpen] = useState(false);

  const handlePNG = () => {
    exportAsPNG(committedCanvasRef.current);
    setOpen(false);
  };

  const handleSVG = () => {
    exportAsSVG(committedCanvasRef.current);
    setOpen(false);
  };

  return (
    <div className={styles.wrapper}>
      <button
        id="btn-export"
        className={styles.exportBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label="Export board"
        aria-expanded={open}
        aria-haspopup="true"
      >
        ⬇ Export
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Export options">
          <button
            id="btn-export-png"
            className={styles.menuItem}
            onClick={handlePNG}
            role="menuitem"
          >
            📷 PNG
          </button>
          <button
            id="btn-export-svg"
            className={styles.menuItem}
            onClick={handleSVG}
            role="menuitem"
          >
            🖼 SVG
          </button>
        </div>
      )}
    </div>
  );
}
