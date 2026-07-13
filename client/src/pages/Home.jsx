/**
 * client/src/pages/Home.jsx
 *
 * Landing page: create a new room or join an existing one by code.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Home.module.css';

export function Home() {
  const navigate  = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Enter your display name first.'); return; }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/rooms', { method: 'POST' });
      const data = await res.json();
      // Store name in sessionStorage so Room page can read it
      sessionStorage.setItem('displayName', name.trim());
      navigate(`/room/${data.roomId}`);
    } catch {
      setError('Failed to create room — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!name.trim())     { setError('Enter your display name first.'); return; }
    if (!joinCode.trim()) { setError('Enter a room code.'); return; }
    sessionStorage.setItem('displayName', name.trim());
    navigate(`/room/${joinCode.trim()}`);
  };

  return (
    <div className={styles.page}>
      {/* Background grid */}
      <div className={styles.grid} aria-hidden="true" />

      <main className={styles.card}>
        <div className={styles.logo}>🎨</div>
        <h1 className={styles.title}>SketchSync</h1>
        <p className={styles.subtitle}>Real-time collaborative drawing — no signup required.</p>

        {/* Name input */}
        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor="input-name">Your name</label>
          <input
            id="input-name"
            className={styles.input}
            type="text"
            placeholder="e.g. Vanshika"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            maxLength={32}
            autoFocus
          />
        </div>

        {/* Create room */}
        <button
          id="btn-create-room"
          className={styles.primaryBtn}
          onClick={handleCreate}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'Creating…' : '✨ Create new room'}
        </button>

        <div className={styles.separator}>
          <span>or join existing</span>
        </div>

        {/* Join room */}
        <form className={styles.joinForm} onSubmit={handleJoin}>
          <input
            id="input-room-code"
            className={styles.input}
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value); setError(''); }}
            maxLength={20}
          />
          <button
            id="btn-join-room"
            type="submit"
            className={styles.secondaryBtn}
          >
            Join →
          </button>
        </form>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <p className={styles.hint}>
          Share your room code and collaborators can join instantly.
        </p>
      </main>
    </div>
  );
}
