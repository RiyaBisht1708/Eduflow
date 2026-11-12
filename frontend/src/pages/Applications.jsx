import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, fmtDate, STATUS_TEXT } from '../api.js';

// What the admin can do at each status: [button label, endpoint suffix]
const ACTION = {
  DOCS_PENDING: ['Verify documents', 'verify-documents'],
  DOCS_VERIFIED: ['Check eligibility', 'check-eligibility'],
  PAID: ['Allocate seat', 'allocate-seat'],
  ADMITTED: ['Enroll student', 'enroll'],
};
const FILTERS = ['', 'DOCS_PENDING', 'DOCS_VERIFIED', 'PAYMENT_PENDING', 'PAID', 'ADMITTED', 'ENROLLED', 'NOT_ELIGIBLE', 'REJECTED'];

export default function Applications() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [flash, setFlash] = useState(null);
  const [open, setOpen] = useState(null);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => api('/admin/applications' + (filter ? `?status=${filter}` : '')).then(setRows).catch((e) => setFlash({ type: 'error', text: e.message })), [filter]);
  useEffect(() => { load(); }, [load]);

  async function act(r) {
    const [, path] = ACTION[r.status];
    setBusy(r.application_id); setFlash(null);
    try {
      const res = await api(`/admin/applications/${r.application_id}/${path}`, { method: 'POST' });
      let text = `#${r.application_id} updated.`;
      if (path === 'check-eligibility') text = res.eligible ? `#${r.application_id} is eligible and moved to payment.` : `#${r.application_id} is not eligible: ${res.reasons.join('; ')}.`;
      if (path === 'allocate-seat') text = res.result === 'SEAT_ALLOCATED' ? `Seat allocated to #${r.application_id}.` : `No seats left: #${r.application_id} was not admitted.`;
      if (path === 'enroll') text = `#${r.application_id} enrolled with number ${res.enrollmentNo}.`;
      setFlash({ type: res.result === 'NO_SEATS_LEFT' || res.eligible === false ? 'info' : 'success', text });
      load();
    } catch (e) { setFlash({ type: 'error', text: e.message }); }
    finally { setBusy(null); }
  }

  async function toggle(id) {
    if (open === id) return setOpen(null);
    setDocs(await api(`/applications/${id}/documents`)); setOpen(id);
  }

  return (
    <section className="page">
      <div className="page-head">
        <div><h1 style={{ fontSize: '2rem' }}>Applications</h1><p className="muted">Most urgent first (priority 1 is highest).</p></div>
        <div><label htmlFor="flt">Show</label>
          <select id="flt" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => <option key={f} value={f}>{f ? STATUS_TEXT[f] : 'All applications'}</option>)}
          </select>
        </div>
      </div>
      {flash && <div className={'notice ' + flash.type} role="status">{flash.text}</div>}

      <div className="panel table-wrap">
        <table>
          <thead><tr><th>#</th><th>Applicant</th><th>Programme</th><th className="num">Priority</th><th>Applied</th><th>Status</th><th>Next step</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan="7" className="muted">Loading…</td></tr>}
            {rows && rows.length === 0 && <tr><td colSpan="7" className="muted">No applications with this status.</td></tr>}
            {rows && rows.map((r) => (
              <Fragment key={r.application_id}>
                <tr>
                  <td>{r.application_id}</td>
                  <td><b>{r.full_name}</b><div className="muted small-text">{r.email}</div></td>
                  <td>{r.program_name}</td>
                  <td className="num">{r.priority}</td>
                  <td>{fmtDate(r.submitted_at)}</td>
                  <td><span className="pill">{STATUS_TEXT[r.status]}</span></td>
                  <td>
                    {ACTION[r.status] && <button className="primary small" disabled={busy === r.application_id} onClick={() => act(r)}>{ACTION[r.status][0]}</button>}{' '}
                    <button className="ghost small" onClick={() => toggle(r.application_id)}>{open === r.application_id ? 'Hide documents' : 'Documents'}</button>
                  </td>
                </tr>
                {open === r.application_id && (
                  <tr><td colSpan="7" style={{ background: 'var(--paper)' }}>
                    {docs.length === 0 ? <span className="muted">No documents uploaded.</span> :
                      docs.map((d) => <div key={d.document_id} className="small-text">{d.doc_type.replaceAll('_', ' ').toLowerCase()}: {d.file_name} <span className="pill">{d.verification_status?.toLowerCase()}</span></div>)}
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
