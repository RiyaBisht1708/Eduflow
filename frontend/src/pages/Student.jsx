import { useEffect, useState } from 'react';
import { api, fmtDate, money } from '../api.js';

export default function Student() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/erp/profile'),
      api('/erp/attendance'),
      api('/erp/results'),
      api('/erp/exams'),
      api('/erp/fees'),
      api('/notifications'),
    ])
      .then(([profile, attendance, results, exams, fees, notifications]) =>
        setData({ profile, attendance, results, exams, fees, notifications }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!data) return <p className="page muted">Loading your student dashboard…</p>;

  const { profile, attendance, results, exams, fees, notifications } = data;
  const totalClasses = attendance.reduce((sum, row) => sum + Number(row.classes || 0), 0);
  const totalAttended = attendance.reduce((sum, row) => sum + Number(row.attended || 0), 0);
  const overallAttendance = totalClasses ? (100 * totalAttended / totalClasses).toFixed(1) : null;
  const totalFees = fees.fees.reduce((sum, fee) => sum + Number(fee.fee_amount || 0), 0);
  const totalPaid = fees.fees.reduce((sum, fee) => sum + Number(fee.paid_amount || 0), 0);
  const outstanding = fees.fees.reduce((sum, fee) => sum + Number(fee.outstanding_amount || 0), 0);

  return (
    <section className="page">
      <div className="page-head student-welcome">
        <div>
          <p className="eyebrow">STUDENT PORTAL</p>
          <h1>{profile.full_name}</h1>
          <p className="muted">{profile.program_name || 'Programme not assigned'} · {profile.dept_name || 'Department not assigned'}</p>
        </div>
        <div className="student-id"><span className="muted small-text">ENROLLMENT NUMBER</span><b>{profile.enrollment_no || 'Pending'}</b></div>
      </div>

      <div className="facts student-facts">
        <div className="fact"><b>{profile.current_semester ? `Semester ${profile.current_semester}` : '—'}</b><span>current semester</span></div>
        <div className="fact"><b>{overallAttendance === null ? '—' : `${overallAttendance}%`}</b><span>overall attendance</span></div>
        <div className="fact"><b>{profile.sgpa ?? '—'}</b><span>SGPA · current semester</span></div>
        <div className="fact"><b>{profile.cgpa ?? '—'}</b><span>CGPA · published results</span></div>
        <div className="fact"><b>{money(totalFees)}</b><span>total configured fees</span></div>
        <div className="fact"><b>{money(totalPaid)}</b><span>paid amount</span></div>
        <div className="fact"><b>{money(outstanding)}</b><span>outstanding amount</span></div>
      </div>

      <div className="two-col">
        <div>
          <div className="panel table-wrap">
            <h2>Subject attendance</h2>
            <table>
              <thead><tr><th>Course</th><th className="num">Classes</th><th className="num">Present</th><th>Attendance</th></tr></thead>
              <tbody>
                {attendance.length === 0 && <tr><td colSpan="4" className="muted">No attendance has been recorded yet.</td></tr>}
                {attendance.map((row) => {
                  const pct = Number(row.pct || 0);
                  return (
                    <tr key={row.course_code}>
                      <td><b>{row.course_code}</b><div className="muted small-text">{row.course_name}</div></td>
                      <td className="num">{row.classes}</td>
                      <td className="num">{row.attended}</td>
                      <td style={{ minWidth: 150 }}>
                        <div className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, pct)}%`, background: pct < 75 ? 'var(--bad)' : 'var(--ok)' }} /></div>
                        <span className={'small-text ' + (Number(row.classes) > 0 && pct < 75 ? 'text-bad' : '')}>
                          {Number(row.classes) === 0 ? 'No classes recorded' : `${pct}%${pct < 75 ? ' · shortage warning' : ''}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel table-wrap">
            <h2>Published results</h2>
            <table>
              <thead><tr><th>Course</th><th>Examination</th><th className="num">Marks</th><th>Grade</th></tr></thead>
              <tbody>
                {results.length === 0 && <tr><td colSpan="4" className="muted">Published results will appear here when released.</td></tr>}
                {results.map((result) => (
                  <tr key={`${result.course_code}-${result.exam_type}-${result.exam_date}`}>
                    <td><b>{result.course_code}</b><div className="muted small-text">{result.course_name}</div></td>
                    <td>{result.exam_type.toLowerCase()}<div className="muted small-text">{fmtDate(result.exam_date)}</div></td>
                    <td className="num">{result.marks} / {result.max_marks}</td>
                    <td><span className="pill">{result.grade}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <div className="panel">
            <h2>Student profile</h2>
            <dl className="profile-list">
              <dt>Email</dt><dd>{profile.email}</dd>
              <dt>Department</dt><dd>{profile.dept_name || '—'}</dd>
              <dt>Programme</dt><dd>{profile.program_name || '—'}</dd>
              <dt>Date of birth</dt><dd>{fmtDate(profile.dob)}</dd>
              <dt>Gender</dt><dd>{profile.gender || '—'}</dd>
              <dt>Address</dt><dd>{profile.address || '—'}</dd>
            </dl>
          </div>

          <div className="panel">
            <h2>Upcoming examinations</h2>
            {exams.length === 0 && <p className="muted small-text">No upcoming examinations are scheduled.</p>}
            {exams.map((exam) => (
              <div className="note-item" key={exam.exam_id}>
                <b>{exam.course_code}</b> · {exam.exam_type.toLowerCase()}
                <div className="muted small-text">{fmtDate(exam.exam_date)} · max {exam.max_marks}</div>
              </div>
            ))}
          </div>

          <div className="panel table-wrap">
            <h2>Fee status</h2>
            {fees.fees.length === 0 && <p className="muted small-text">No fee schedule is configured for your applications.</p>}
            {fees.fees.map((fee) => (
              <div className="fee-row" key={`${fee.application_id}-${fee.fee_type}`}>
                <div><b>{fee.fee_type.replaceAll('_', ' ')}</b><div className="muted small-text">{fee.program_name}</div>
                  <span className={`pill ${Number(fee.outstanding_amount) === 0 ? 'ok' : Number(fee.paid_amount) > 0 ? 'wait' : 'bad'}`}>
                    {Number(fee.outstanding_amount) === 0 ? 'paid' : Number(fee.paid_amount) > 0 ? 'partial' : 'due'}
                  </span>
                </div>
                <div className="fee-amount">{money(fee.paid_amount)} / {money(fee.fee_amount)}<div className="muted small-text">{money(fee.outstanding_amount)} outstanding</div></div>
              </div>
            ))}
            <h3 className="subhead">Transaction history</h3>
            {fees.transactions.length === 0 && <p className="muted small-text">No payments recorded.</p>}
            {fees.transactions.map((transaction) => (
              <div className="note-item" key={transaction.payment_id}>
                <b>{money(transaction.amount)}</b> · {transaction.status.toLowerCase()}
                <div className="muted small-text">{transaction.txn_ref || 'No transaction reference'} · {fmtDate(transaction.paid_at)}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h2>Notifications</h2>
            {notifications.length === 0 && <p className="muted small-text">You have no notifications.</p>}
            {notifications.slice(0, 5).map((notification) => (
              <div className={'note-item ' + (!notification.is_read ? 'unread' : '')} key={notification.notification_id}>
                {notification.message}<div className="muted small-text">{fmtDate(notification.created_at)}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
