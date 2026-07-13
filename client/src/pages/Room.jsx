/**
 * client/src/pages/Room.jsx
 *
 * The main whiteboard room page. Orchestrates:
 *   - Socket connection + room:join on mount
 *   - Reconnection handling (re-emits room:join on socket reconnect)
 *   - Keyboard shortcuts (Ctrl+Z = undo, Ctrl+Shift+Z = redo)
 *   - Layout: canvas + sidebar + toolbar
 */

import { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { TOOL_PEN, TOOL_ERASER, TOOL_RECT, TOOL_CIRCLE, TOOL_LINE, TOOL_TRIANGLE, TOOL_STAR, TOOL_DIAMOND, TOOL_TEXT } from '../lib/operationTypes.js';
import { useSocket }   from '../hooks/useSocket.js';
import { useUndoRedo } from '../hooks/useUndoRedo.js';
import { useRoomStore } from '../store/roomStore.js';
import { WhiteboardCanvas } from '../components/Canvas/WhiteboardCanvas.jsx';
import { Toolbar }    from '../components/Toolbar/Toolbar.jsx';
import { UserList }   from '../components/Sidebar/UserList.jsx';
import { RoomInfo }   from '../components/Sidebar/RoomInfo.jsx';
import { ExportButton } from '../components/ui/ExportButton.jsx';
import styles from './Room.module.css';

/**
 * Gets or creates a persistent userId in localStorage.
 * This allows the same user to reconnect and keep their identity.
 */
function getOrCreateUserId() {
  const key = 'whiteboard_userId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `u_${nanoid(10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function Room() {
  const { roomId }  = useParams();
  const navigate    = useNavigate();
  const socket      = useSocket();
  const { undo, redo } = useUndoRedo();
  const committedCanvasRef = useRef(null);

  const initRoom    = useRoomStore((s) => s.initRoom);
  const reset       = useRoomStore((s) => s.reset);
  const upsertUser  = useRoomStore((s) => s.upsertUser);

  const userId      = getOrCreateUserId();
  const displayName = sessionStorage.getItem('displayName') || 'Anonymous';

  // ── Join room on mount ─────────────────────────────────────────────────────
  const joinRoom = useCallback(() => {
    socket.emit('room:join', { roomId, userId, displayName });
  }, [socket, roomId, userId, displayName]);

  useEffect(() => {
    if (!roomId) { navigate('/'); return; }

    // Connect socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    // Handle full state sync from server
    const onRoomJoined = (data) => {
      initRoom({ ...data, displayName });
      // Also pre-populate committed canvas ref once canvas mounts
    };

    // On reconnect, re-emit room:join to get a fresh state sync
    const onReconnect = () => {
      console.log('[Room] Reconnected — resyncing room state');
      joinRoom();
    };

    socket.on('room:joined', onRoomJoined);
    socket.on('reconnect',   onReconnect);

    joinRoom();

    return () => {
      socket.off('room:joined', onRoomJoined);
      socket.off('reconnect',   onReconnect);
      socket.emit('room:leave', { roomId, userId });
      reset();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === 'z' &&  e.shiftKey) { e.preventDefault(); redo(); }
      if (e.key === 'y')                { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={styles.sidebar} aria-label="Room sidebar">
        <div className={styles.sidebarHeader}>
          <span className={styles.appName}>🎨 SketchSync</span>
          <ExportButton committedCanvasRef={committedCanvasRef} />
        </div>
        <div className={styles.sidebarDivider} />
        <RoomInfo />
        <div className={styles.sidebarDivider} />
        <UserList />
      </aside>

      {/* ── Canvas area ─────────────────────────────────────────────── */}
      <main className={styles.canvasArea} aria-label="Whiteboard canvas">
        <WhiteboardCanvas committedCanvasRef={committedCanvasRef} />
      </main>

      {/* ── Floating toolbar ─────────────────────────────────────────── */}
      <Toolbar />
    </div>
  );
}
