import { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../../store/roomStore.js';
import { useSocket } from '../../hooks/useSocket.js';
import styles from './RoomChat.module.css';

export function RoomChat() {
  const socket = useSocket();
  const roomId = useRoomStore((s) => s.roomId);
  const userId = useRoomStore((s) => s.userId);
  const displayName = useRoomStore((s) => s.displayName);
  const chatMessages = useRoomStore((s) => s.chatMessages);

  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    socket.emit('chat:message', {
      roomId,
      userId,
      displayName,
      text: text.trim(),
    });
    setText('');
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messagesList}>
        {chatMessages.length === 0 ? (
          <div className={styles.emptyChat}>No messages yet. Start the conversation!</div>
        ) : (
          chatMessages.map((msg) => {
            const isMe = msg.userId === userId;
            return (
              <div
                key={msg.id}
                className={`${styles.messageWrapper} ${isMe ? styles.messageMe : styles.messageOther}`}
              >
                <div className={styles.messageMeta}>
                  <span className={styles.senderName}>{msg.displayName}</span>
                  <span className={styles.time}>{msg.timestamp}</span>
                </div>
                <div className={styles.messageBubble}>{msg.text}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className={styles.chatInputForm}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
          className={styles.chatInput}
          maxLength={500}
        />
        <button type="submit" className={styles.sendBtn}>
          Send
        </button>
      </form>
    </div>
  );
}
