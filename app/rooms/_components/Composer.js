'use client';

import { useState } from 'react';
import styles from '../rooms.module.css';

const QUICK_REACTS = ['🔥', '🙌', '💜', '🫶', '😂', '🥲'];

/**
 * Message composer. Sending renders the message instantly as "sending" (handled
 * upstream via the outbox); the input never blocks on the network. Works offline
 * — composed messages queue and flush on reconnect.
 */
export default function Composer({ onSend, onReact, disabled }) {
  const [text, setText] = useState('');

  function submit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    onSend(value);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {QUICK_REACTS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`react ${emoji}`}
            onClick={() => onReact(emoji)}
            className={styles.btn}
            style={{ padding: '0.3rem 0.55rem', borderRadius: 999, fontSize: '1rem' }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? 'this room is gone' : 'say something…'}
          maxLength={4000}
          disabled={disabled}
          aria-label="message"
          autoComplete="off"
        />
        <button
          type="submit"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={disabled || !text.trim()}
          style={{ flexShrink: 0 }}
        >
          send
        </button>
      </form>
    </div>
  );
}
