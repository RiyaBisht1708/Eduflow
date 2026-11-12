import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homeFor } from '../auth.jsx';

export default function Login() {
  const [params] = useSearchParams();
  const [register, setRegister] = useState(params.get('mode') === 'register');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await api(register ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: register ? form : { email: form.email, password: form.password },
      });
      login(data);
      nav(homeFor(data.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <section className="page" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: '2rem' }}>{register ? 'Create your applicant account' : 'Sign in'}</h1>
      <form className="panel" onSubmit={submit}>
        {error && <div className="notice error" role="alert">{error}</div>}
        {register && (
          <>
            <div className="field"><label htmlFor="fn">Full name</label><input id="fn" value={form.fullName} onChange={set('fullName')} required /></div>
            <div className="field"><label htmlFor="ph">Phone</label><input id="ph" value={form.phone} onChange={set('phone')} /></div>
          </>
        )}
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} />
          {register && <div className="hint">At least 8 characters.</div>}
        </div>
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </form>
      <p>
        {register ? 'Already have an account? ' : 'New applicant? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</a>
      </p>
      {!register && <p className="muted small-text">Demo accounts (password <b>password123</b>): admin@eduflow.edu, riya@eduflow.edu (counsellor), aarav@mail.com (applicant).</p>}
    </section>
  );
}
