/**
 * client/src/components/Sidebar/RoomInfo.jsx
 *
 * Shows room code + share link with a copy-to-clipboard button.
 */

import { useState } from 'react';
import { useRoomStore } from '../../store/roomStore.js';
import styles from './Sidebar.module.css';

export function RoomInfo() {
  const roomId = useRoomStore((s) => s.roomId);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/room/${roomId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={styles.roomInfo}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Room</span>
      </div>

      <div className={styles.roomCode}>
        <span className={styles.roomCodeLabel}>Code</span>
        <code className={styles.code}>{roomId}</code>
      </div>

      <button
        id="btn-copy-link"
        className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
        onClick={handleCopy}
        aria-label="Copy share link to clipboard"
      >
        {copied ? '✓ Copied!' : '🔗 Copy invite link'}
      </button>
    </div>
  );
}
