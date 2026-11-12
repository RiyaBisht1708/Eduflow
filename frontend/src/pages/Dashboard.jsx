import { useEffect, useState } from 'react';
import { api, money, STATUS_TEXT } from '../api.js';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/admin/stats').then(setS).catch((e) => setErr(e.message)); }, []);

  if (err) return <section className="page"><div className="notice error">{err}</div></section>;
  if (!s) return <p className="page muted">Loading statistics…</p>;
  const max = Math.max(1, ...s.funnel.map((f) => Number(f.count)));

  return (
    <section className="page">
      <div className="page-head"><div><p className="eyebrow">UNIVERSITY ERP</p><h1>Admin dashboard</h1><p className="muted">Live admissions, enrollment, fee and attendance figures.</p></div>
        <div className="dashboard-actions"><Link className="btn small" to="/admin/attendance">Take attendance</Link><Link className="btn small" to="/admin/exams">Manage exams</Link></div>
      </div>

      <div className="facts">
        <div className="fact"><b>{s.totals.applicants}</b><span>applicants</span></div>
        <div className="fact"><b>{s.totals.enrolled}</b><span>students enrolled</span></div>
        <div className="fact"><b>{s.totals.programs}</b><span>programmes</span></div>
        <div className="fact"><b>{s.totals.applications}</b><span>applications</span></div>
        <div className="fact"><b>{money(s.totals.revenue)}</b><span>fees collected</span></div>
        <div className="fact"><b>{s.attendance.attendance_pct}%</b><span>attendance · {s.attendance.classes} classes</span></div>
      </div>

      <div className="panel table-wrap">
        <h2>Seats by programme</h2>
        <table>
          <thead><tr><th>Programme</th><th className="num">Applications</th><th className="num">Admitted</th><th className="num">Enrolled</th><th className="num">Rejected</th><th>Seats filled</th></tr></thead>
          <tbody>
            {s.programs.map((p) => {
              const filled = p.total_seats ? (p.filled_seats / p.total_seats) * 100 : 0;
              return (
                <tr key={p.program_id}>
                  <td><b>{p.program_name}</b></td>
                  <td className="num">{p.total_applications}</td><td className="num">{p.admitted}</td>
                  <td className="num">{p.enrolled}</td><td className="num">{p.rejected}</td>
                  <td style={{ minWidth: 180 }}>
                    <div className="bar" aria-hidden="true"><span style={{ width: `${filled}%`, background: filled >= 100 ? 'var(--bad)' : undefined }} /></div>
                    <span className="small-text muted">{p.filled_seats} of {p.total_seats} seats ({p.seats_left} left)</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Where applications are right now</h2>
        {s.funnel.length === 0 && <p className="muted">No applications yet.</p>}
        {s.funnel.map((f) => (
          <div className="funnel-row" key={f.status}>
            <span>{STATUS_TEXT[f.status] || f.status}</span>
            <div className="bar"><span style={{ width: `${(Number(f.count) / max) * 100}%` }} /></div>
            <b>{f.count}</b>
          </div>
        ))}
      </div>

      <div className="panel table-wrap">
        <div className="panel-heading"><h2>Recent applications</h2><Link to="/admin/applications">View all</Link></div>
        <table>
          <thead><tr><th>Applicant</th><th>Programme</th><th>Submitted</th><th>Status</th></tr></thead>
          <tbody>
            {s.recentApplications.length === 0 && <tr><td colSpan="4" className="muted">No applications received yet.</td></tr>}
            {s.recentApplications.map((application) => (
              <tr key={application.application_id}>
                <td><b>{application.full_name}</b><div className="muted small-text">{application.email}</div></td>
                <td>{application.program_name}</td><td>{new Date(application.submitted_at).toLocaleDateString()}</td>
                <td><span className="pill">{STATUS_TEXT[application.status] || application.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
