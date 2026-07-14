import { useRoomStore } from '../../store/roomStore.js';
import styles from './LayersPanel.module.css';

export function LayersPanel() {
  const layers = useRoomStore((s) => s.layers);
  const activeLayerId = useRoomStore((s) => s.activeLayerId);
  const toggleVisibility = useRoomStore((s) => s.toggleLayerVisibility);
  const setActiveLayer = useRoomStore((s) => s.setActiveLayerId);
  const moveUp = useRoomStore((s) => s.moveLayerUp);
  const moveDown = useRoomStore((s) => s.moveLayerDown);

  return (
    <div className={styles.layersContainer}>
      <h3 className={styles.title}>Layers</h3>
      <div className={styles.layersList}>
        {layers.map((layer, index) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`${styles.layerRow} ${isActive ? styles.activeRow : ''}`}
            >
              <div className={styles.layerInfo} onClick={() => setActiveLayer(layer.id)}>
                <input
                  type="radio"
                  checked={isActive}
                  onChange={() => setActiveLayer(layer.id)}
                  className={styles.radioInput}
                />
                <span className={styles.layerName}>{layer.name}</span>
                {isActive && <span className={styles.activeTag}>(Active)</span>}
              </div>

              <div className={styles.layerControls}>
                <button
                  type="button"
                  onClick={() => toggleVisibility(layer.id)}
                  className={`${styles.iconBtn} ${!layer.visible ? styles.hidden : ''}`}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  {layer.visible ? '👁️' : '🕶️'}
                </button>
                
                <div className={styles.orderBtns}>
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className={styles.orderBtn}
                    title="Move up (bring forward)"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === layers.length - 1}
                    className={styles.orderBtn}
                    title="Move down (send backward)"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className={styles.tip}>Tip: Active layer is where new drawings are placed.</p>
    </div>
  );
}
