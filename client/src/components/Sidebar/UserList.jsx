/**
 * client/src/components/Sidebar/UserList.jsx
 *
 * Presence panel showing all connected users with their color badge.
 */

import { useRoomStore } from '../../store/roomStore.js';
import styles from './Sidebar.module.css';

export function UserList() {
  const users      = useRoomStore((s) => s.users);
  const myUserId   = useRoomStore((s) => s.userId);
  const isConnected = useRoomStore((s) => s.isConnected);

  const userArray = Array.from(users.values());

  return (
    <div className={styles.userList}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>People</span>
        <span className={`${styles.badge} ${isConnected ? styles.online : styles.offline}`}>
          {isConnected ? `${userArray.length} online` : 'disconnected'}
        </span>
      </div>

      <ul className={styles.users} aria-label="Connected users">
        {userArray.map((user) => (
          <li key={user.userId} className={styles.userItem}>
            <span
              className={styles.colorDot}
              style={{ background: user.color }}
              aria-hidden="true"
            />
            <span className={styles.userName}>
              {user.displayName}
              {user.userId === myUserId && (
                <span className={styles.youLabel}> (you)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
