import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

const STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'APPLIED', 'LOST'];
const label = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export default function Leads() {
  const [leads, setLeads] = useState(null);
  const [open, setOpen] = useState(null);
  const [ups, setUps] = useState([]);
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [flash, setFlash] = useState(null);

  const load = useCallback(() => api('/leads').then(setLeads).catch((e) => setFlash({ type: 'error', text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id, status) {
    try { await api(`/leads/${id}/status`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { setFlash({ type: 'error', text: e.message }); }
  }
  async function toggle(id) {
    if (open === id) return setOpen(null);
    setUps(await api(`/leads/${id}/followups`)); setOpen(id); setNote(''); setNext('');
  }
  async function addFollowUp(e, id) {
    e.preventDefault();
    try {
      await api(`/leads/${id}/followups`, { method: 'POST', body: { note, nextDate: next } });
      setUps(await api(`/leads/${id}/followups`)); setNote(''); setNext(''); load();
    } catch (x) { setFlash({ type: 'error', text: x.message }); }
  }

  return (
    <section className="page">
      <div className="page-head"><div><h1 style={{ fontSize: '2rem' }}>Leads</h1><p className="muted">Enquiries from the website, assigned to the counsellor with the lightest workload.</p></div></div>
      {flash && <div className={'notice ' + flash.type} role="alert">{flash.text}</div>}
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Interested in</th><th>Counsellor</th><th>Status</th><th>Next follow-up</th><th></th></tr></thead>
          <tbody>
            {!leads && <tr><td colSpan="7" className="muted">Loading…</td></tr>}
            {leads && leads.length === 0 && <tr><td colSpan="7" className="muted">No leads yet. They appear when someone fills in the enquiry form on the home page.</td></tr>}
            {leads && leads.map((l) => (
              <Fragment key={l.lead_id}>
                <tr>
                  <td><b>{l.name}</b><div className="muted small-text">{fmtDate(l.created_at)}</div></td>
                  <td className="small-text">{l.email}<br />{l.phone}</td>
                  <td>{l.program_name || '—'}</td>
                  <td>{l.counsellor || 'Unassigned'}</td>
                  <td>
                    <label className="sr-only" htmlFor={`st-${l.lead_id}`} style={{ position: 'absolute', left: -9999 }}>Status of {l.name}</label>
                    <select id={`st-${l.lead_id}`} value={l.status} onChange={(e) => setStatus(l.lead_id, e.target.value)} style={{ width: 'auto' }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                  </td>
                  <td>{fmtDate(l.next_follow_up)}</td>
                  <td><button className="ghost small" onClick={() => toggle(l.lead_id)}>{open === l.lead_id ? 'Close' : 'Follow-ups'}</button></td>
                </tr>
                {open === l.lead_id && (
                  <tr><td colSpan="7" style={{ background: 'var(--paper)' }}>
                    {ups.length === 0 && <p className="muted small-text">No follow-ups logged yet.</p>}
                    {ups.map((u) => <div key={u.followup_id} className="note-item">{u.note}<div className="muted small-text">Logged {fmtDate(u.created_at)}{u.next_date ? ` · next contact ${fmtDate(u.next_date)}` : ''}</div></div>)}
                    <form onSubmit={(e) => addFollowUp(e, l.lead_id)} className="field-row" style={{ marginTop: '.75rem', alignItems: 'end' }}>
                      <div className="field" style={{ gridColumn: 'span 2', marginBottom: 0 }}><label htmlFor="fnote">What was discussed?</label><input id="fnote" value={note} onChange={(e) => setNote(e.target.value)} required /></div>
                      <div className="field" style={{ marginBottom: 0 }}><label htmlFor="fnext">Next contact</label><input id="fnext" type="date" value={next} onChange={(e) => setNext(e.target.value)} /></div>
                      <div><button className="primary">Log follow-up</button></div>
                    </form>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
