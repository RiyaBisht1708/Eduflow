import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import Route from '../components/Route.jsx';

export default function Landing() {
  const [programs, setPrograms] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', programId: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/programs').then(setPrograms).catch(() => {}); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api('/leads', { method: 'POST', body: { ...form, programId: form.programId ? Number(form.programId) : null } });
      setMsg({ type: 'success', text: r.message });
      setForm({ name: '', email: '', phone: '', programId: '' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div>
            <h1>Every admission, followed from enquiry to enrolment.</h1>
            <p>Apply online, upload your documents, pay your fee and see exactly where your application stands, without calling the office.</p>
            <Link className="btn" to="/login?mode=register">Start your application</Link>
            <Route />
          </div>
          <form className="panel" onSubmit={submit}>
            <h2>Talk to a counsellor</h2>
            <p className="muted small-text">Leave your details and we will call you back.</p>
            {msg && <div className={'notice ' + msg.type} role="status">{msg.text}</div>}
            <div className="field"><label htmlFor="ln">Your name</label><input id="ln" value={form.name} onChange={set('name')} required /></div>
            <div className="field-row">
              <div className="field"><label htmlFor="le">Email</label><input id="le" type="email" value={form.email} onChange={set('email')} /></div>
              <div className="field"><label htmlFor="lp">Phone</label><input id="lp" value={form.phone} onChange={set('phone')} /></div>
            </div>
            <div className="field">
              <label htmlFor="lg">Programme you are interested in</label>
              <select id="lg" value={form.programId} onChange={set('programId')}>
                <option value="">Not sure yet</option>
                {programs.map((p) => <option key={p.program_id} value={p.program_id}>{p.program_name}</option>)}
              </select>
            </div>
            <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Request a call back'}</button>
          </form>
        </div>
      </section>

      <section className="page">
        <h2>Programmes open for admission</h2>
        <div className="panel table-wrap">
          <table>
            <thead><tr><th>Programme</th><th>Department</th><th className="num">Duration</th><th className="num">Annual fee</th><th>Seats left</th></tr></thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.program_id}>
                  <td><b>{p.program_name}</b></td>
                  <td>{p.dept_name}</td>
                  <td className="num">{p.duration_yrs} years</td>
                  <td className="num">{money(p.annual_fee)}</td>
                  <td>{p.seats_left === 0 ? <span className="pill bad">Full</span> : <span className="pill ok">{p.seats_left} of {p.total_seats}</span>}</td>
                </tr>
              ))}
              {programs.length === 0 && <tr><td colSpan="5" className="muted">Programmes will appear here once the server is running.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
