'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import type { AuthState } from '@/lib/actions/auth';

type Action = (prev: AuthState, form: FormData) => Promise<AuthState>;

export default function AuthForm({ mode, action }: { mode: 'login' | 'register'; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const reg = mode === 'register';
  return (
    <form action={formAction}>
      <div className="logo">
        <span className="mark" /> Barycal
      </div>
      <p className="tag">your life in orbit</p>
      <div className="field">
        <label>Username</label>
        <input name="username" type="text" autoCapitalize="off" placeholder="ed" />
      </div>
      {reg && (
        <div className="field">
          <label>Display name</label>
          <input name="displayName" type="text" placeholder="Ed Shen" />
        </div>
      )}
      <div className="field">
        <label>Password</label>
        <input name="password" type="password" placeholder="••••••••" />
      </div>
      <button className="btn solid block" disabled={pending}>
        {reg ? 'Create account' : 'Log in'}
      </button>
      {state?.error && <div className="error">{state.error}</div>}
      <div className="toggle-link">
        {reg ? (
          <>
            Have an account?{' '}
            <Link href="/login">
              <b>Log in</b>
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/register">
              <b>Create account</b>
            </Link>
          </>
        )}
      </div>
      {!reg && (
        <div className="toggle-link faint" style={{ marginTop: 22 }}>
          demo · <b>ed</b> / <b>barycal</b>
        </div>
      )}
    </form>
  );
}
