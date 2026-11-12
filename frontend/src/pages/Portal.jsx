import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, money, STATUS_TEXT } from '../api.js';
import Route from '../components/Route.jsx';

const DOCS = [
  ['TENTH_MARKSHEET', '10th marksheet', true],
  ['TWELFTH_MARKSHEET', '12th marksheet', true],
  ['ID_PROOF', 'ID proof', true],
  ['PHOTO', 'Passport photo', false],
  ['ENTRANCE_SCORECARD', 'Entrance scorecard', false],
];
const tone = (s) => (['ENROLLED', 'ADMITTED'].includes(s) ? 'ok' : ['NOT_ELIGIBLE', 'REJECTED'].includes(s) ? 'bad' : ['PAYMENT_PENDING', 'SUBMITTED'].includes(s) ? 'wait' : '');

export default function Portal() {
  const [apps, setApps] = useState(null);
  const [notes, setNotes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    const [a, n] = await Promise.all([api('/applications/mine'), api('/notifications')]);
    setApps(a); setNotes(n);
    if (a.length === 0) setShowForm(true);
  }, []);

  useEffect(() => { load().catch((e) => setFlash({ type: 'error', text: e.message })); api('/programs').then(setPrograms); }, [load]);

  async function markRead() { await api('/notifications/read-all', { method: 'POST' }); load(); }

  if (!apps) return <p className="page muted">Loading your applications…</p>;
  const unread = notes.filter((n) => !n.is_read).length;

  return (
    <section className="page">
      <div className="page-head">
        <div><h1 style={{ fontSize: '2rem' }}>My applications</h1><p className="muted">Follow each application along the route below.</p></div>
        {!showForm && <button className="primary" onClick={() => setShowForm(true)}>Apply to a programme</button>}
      </div>
      {flash && <div className={'notice ' + flash.type} role="status">{flash.text}</div>}

      <div className="two-col">
        <div>
          {showForm && <ApplyForm programs={programs} onDone={(t) => { setShowForm(false); setFlash(t); load(); }} onCancel={apps.length ? () => setShowForm(false) : null} />}
          {apps.map((a) => <AppCard key={a.application_id} app={a} reload={load} setFlash={setFlash} />)}
        </div>
        <aside className="panel" aria-label="Notifications">
          <h3>Updates {unread > 0 && <span className="pill">{unread} new</span>}</h3>
          {notes.length === 0 && <p className="muted small-text">Status changes will appear here.</p>}
          {notes.map((n) => (
            <div key={n.notification_id} className={'note-item' + (n.is_read ? '' : ' unread')}>
              {n.message}<div className="muted small-text">{fmtDate(n.created_at)}</div>
            </div>
          ))}
          {unread > 0 && <button className="ghost small" onClick={markRead}>Mark all as read</button>}
        </aside>
      </div>
    </section>
  );
}

function ApplyForm({ programs, onDone, onCancel }) {
  const [f, setF] = useState({ programId: '', tenthPct: '', twelfthPct: '', entranceScore: '', address: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      await api('/applications', { method: 'POST', body: { programId: Number(f.programId), tenthPct: Number(f.tenthPct), twelfthPct: Number(f.twelfthPct), entranceScore: Number(f.entranceScore), address: f.address } });
      onDone({ type: 'success', text: 'Application submitted. Upload your documents next.' });
    } catch (x) { setErr(x.message); }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>New application</h2>
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="field">
        <label htmlFor="pg">Programme</label>
        <select id="pg" value={f.programId} onChange={set('programId')} required>
          <option value="">Choose a programme</option>
          {programs.map((p) => <option key={p.program_id} value={p.program_id}>{p.program_name} ({p.seats_left} seats left)</option>)}
        </select>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="t10">10th marks (%)</label><input id="t10" type="number" step="0.01" min="0" max="100" value={f.tenthPct} onChange={set('tenthPct')} required /></div>
        <div className="field"><label htmlFor="t12">12th marks (%)</label><input id="t12" type="number" step="0.01" min="0" max="100" value={f.twelfthPct} onChange={set('twelfthPct')} required /></div>
        <div className="field"><label htmlFor="ent">Entrance score</label><input id="ent" type="number" step="0.01" min="0" value={f.entranceScore} onChange={set('entranceScore')} required /></div>
      </div>
      <div className="field"><label htmlFor="ad">Address</label><textarea id="ad" rows="2" value={f.address} onChange={set('address')} /></div>
      <button className="primary">Submit application</button>{' '}
      {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function AppCard({ app, reload, setFlash }) {
  const [docs, setDocs] = useState([]);
  const [history, setHistory] = useState(null);
  const id = app.application_id;
  const s = app.status;

  const loadDocs = useCallback(() => api(`/applications/${id}/documents`).then(setDocs), [id]);
  useEffect(() => { loadDocs(); }, [loadDocs, s]);

  async function upload(type, file) {
    if (!file) return;
    try { await api(`/applications/${id}/documents`, { method: 'POST', body: { docType: type, fileName: file.name } }); await loadDocs(); reload(); }
    catch (e) { setFlash({ type: 'error', text: e.message }); }
  }
  async function pay() {
    try { const r = await api(`/applications/${id}/pay`, { method: 'POST' }); setFlash({ type: 'success', text: `Payment of ${money(r.amount)} received. Reference ${r.txnRef}.` }); reload(); }
    catch (e) { setFlash({ type: 'error', text: e.message }); }
  }
  async function toggleHistory() { setHistory(history ? null : await api(`/applications/${id}/history`)); }

  const byType = Object.fromEntries(docs.map((d) => [d.doc_type, d]));
  const canUpload = s === 'SUBMITTED' || s === 'DOCS_PENDING';

  return (
    <article className="panel app-card">
      <h3>
        <span>{app.program_name} <span className="muted small-text">#{id}</span></span>
        <span className={'pill ' + tone(s)}>{STATUS_TEXT[s]}</span>
      </h3>
      <Route status={s} />

      {canUpload && (
        <div className="next-step">
          <b>{s === 'SUBMITTED' ? 'Upload your documents' : 'Documents are with the admissions team'}</b>
          <p className="muted small-text">The 10th marksheet, 12th marksheet and ID proof are required before verification can start.</p>
          {DOCS.map(([type, label, req]) => {
            const d = byType[type];
            return (
              <div className="doc-row" key={type}>
                <div>
                  <label htmlFor={`${id}-${type}`} style={{ margin: 0 }}>{label}{req ? ' *' : ''}</label>
                  <span className="muted small-text">{d ? `${d.file_name} · ${d.verification_status?.toLowerCase()}` : 'Not uploaded'}</span>
                </div>
                <input id={`${id}-${type}`} type="file" style={{ width: 'auto', maxWidth: 220 }} onChange={(e) => upload(type, e.target.files[0])} />
              </div>
            );
          })}
        </div>
      )}
      {s === 'DOCS_VERIFIED' && <div className="next-step"><b>Documents verified.</b> The admissions team will check your eligibility next.</div>}
      {s === 'PAYMENT_PENDING' && (
        <div className="next-step">
          <b>You are eligible. Pay the admission fee of {money(app.admission_fee)} to continue.</b>
          <p className="muted small-text">This prototype simulates the payment; no money moves.</p>
          <button className="primary" onClick={pay}>Pay {money(app.admission_fee)}</button>
        </div>
      )}
      {s === 'PAID' && <div className="next-step"><b>Payment received.</b> Your seat is being allocated.</div>}
      {s === 'ADMITTED' && <div className="next-step"><b>You have a seat.</b> The office will confirm your enrolment shortly.</div>}
      {s === 'NOT_ELIGIBLE' && <div className="next-step"><b>This application did not meet the programme's eligibility rules.</b> You can apply to another programme.</div>}
      {s === 'REJECTED' && <div className="next-step"><b>All seats in this programme were taken.</b> You can apply to another programme.</div>}
      {s === 'ENROLLED' && <div className="next-step"><b>Welcome aboard.</b> <Link to="/student">Open your student page</Link> for attendance and results.</div>}

      <p style={{ marginTop: '1rem', marginBottom: 0 }}>
        <button className="ghost small" onClick={toggleHistory}>{history ? 'Hide history' : 'Show history'}</button>
      </p>
      {history && (
        <ul className="small-text">
          {history.map((h, i) => <li key={i}>{fmtDate(h.changed_at)}: {h.old_status ? `${STATUS_TEXT[h.old_status]} → ` : ''}{STATUS_TEXT[h.new_status]}</li>)}
        </ul>
      )}
    </article>
  );
}
