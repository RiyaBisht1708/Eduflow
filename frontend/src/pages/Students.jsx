import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Students() {
  const [students, setStudents] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [query, setQuery] = useState('');
  const [programId, setProgramId] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const loadStudents = useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (programId) params.set('programId', programId);
    setStudents(null);
    api(`/admin/students${params.size ? `?${params}` : ''}`)
      .then(setStudents)
      .catch((e) => {
        setStudents([]);
        setMessage({ type: 'error', text: e.message });
      });
  }, [query, programId]);

  useEffect(() => {
    api('/programs').then(setPrograms).catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function toggleProfile(id) {
    if (expanded === id) {
      setExpanded(null);
      setProfile(null);
      return;
    }
    setExpanded(id);
    setProfile(null);
    try {
      setProfile(await api(`/admin/students/${id}`));
    } catch (e) {
      setExpanded(null);
      setMessage({ type: 'error', text: e.message });
    }
  }

  async function saveAcademic(student, event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(student.student_id);
    setMessage(null);
    try {
      await api(`/admin/students/${student.student_id}/academic`, {
        method: 'PUT',
        body: { programId: Number(form.get('programId')), currentSemester: Number(form.get('currentSemester')) },
      });
      setMessage({ type: 'success', text: `Academic information saved for ${student.full_name}.` });
      loadStudents();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <div><p className="eyebrow">UNIVERSITY ERP</p><h1>Enrolled students</h1><p className="muted">Search student profiles and maintain academic programme and semester.</p></div>
      </div>
      {message && <div className={`notice ${message.type}`} role="status">{message.text}</div>}

      <form className="panel student-filters" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="student-search">Search students</label>
          <input id="student-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or enrollment number" />
        </div>
        <div className="field">
          <label htmlFor="student-program">Programme</label>
          <select id="student-program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">All programmes</option>
            {programs.map((program) => <option key={program.program_id} value={program.program_id}>{program.program_name}</option>)}
          </select>
        </div>
      </form>

      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Enrollment no.</th><th>Student</th><th>Department / programme</th><th>Current semester</th><th>Manage</th><th>Profile</th></tr></thead>
          <tbody>
            {students === null && <tr><td colSpan="6" className="muted">Loading enrolled students…</td></tr>}
            {students?.length === 0 && <tr><td colSpan="6" className="muted">No enrolled students match this filter.</td></tr>}
            {students?.map((student) => (
              <Fragment key={student.student_id}>
                <tr>
                  <td>{student.enrollment_no}</td>
                  <td><b>{student.full_name}</b><div className="muted small-text">{student.email}</div></td>
                  <td>{student.dept_name}<div className="muted small-text">{student.program_name}</div></td>
                  <td>{student.current_semester}</td>
                  <td><form className="academic-edit" onSubmit={(event) => saveAcademic(student, event)}>
                    <select aria-label={`Programme for ${student.full_name}`} name="programId" defaultValue={student.program_id}>
                      {programs.map((program) => <option key={program.program_id} value={program.program_id}>{program.program_name}</option>)}
                    </select>
                    <input aria-label={`Semester for ${student.full_name}`} name="currentSemester" type="number" min="1" max="12" defaultValue={student.current_semester} />
                    <button className="primary small" disabled={busy === student.student_id}>{busy === student.student_id ? 'Saving…' : 'Save'}</button>
                  </form></td>
                  <td><button className="ghost small" onClick={() => toggleProfile(student.student_id)}>{expanded === student.student_id ? 'Hide' : 'View profile'}</button></td>
                </tr>
                {expanded === student.student_id && (
                  <tr><td colSpan="6" className="profile-expanded">
                    {!profile && <span className="muted">Loading profile…</span>}
                    {profile?.student_id === student.student_id && <dl className="profile-list profile-inline">
                      <dt>Phone</dt><dd>{profile.phone || '—'}</dd>
                      <dt>Date of birth</dt><dd>{profile.dob || '—'}</dd>
                      <dt>Gender</dt><dd>{profile.gender || '—'}</dd>
                      <dt>Address</dt><dd>{profile.address || '—'}</dd>
                    </dl>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small-text">Faculty records are not supported by the current database or authentication roles.</p>
    </section>
  );
}
