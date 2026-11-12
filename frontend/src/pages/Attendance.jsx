import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function Attendance() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(today);
  const [students, setStudents] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api('/admin/erp/courses')
      .then((rows) => {
        setCourses(rows);
        if (rows.length) setCourseId(String(rows[0].course_id));
      })
      .catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);

  const loadRoster = useCallback(() => {
    if (!courseId || !date) {
      setStudents([]);
      return;
    }
    setStudents(null);
    api(`/admin/erp/roster?courseId=${encodeURIComponent(courseId)}&date=${encodeURIComponent(date)}`)
      .then((rows) => setStudents(rows.map((row) => ({
        ...row,
        mark: row.present === null ? '' : row.present ? 'PRESENT' : 'ABSENT',
      }))))
      .catch((e) => {
        setStudents([]);
        setMessage({ type: 'error', text: e.message });
      });
  }, [courseId, date]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  async function save(row) {
    setBusy(row.student_id);
    setMessage(null);
    try {
      await api('/admin/erp/attendance', {
        method: 'POST',
        body: { studentId: row.student_id, courseId: Number(courseId), date, present: row.mark === 'PRESENT' },
      });
      setMessage({ type: 'success', text: `Attendance saved for ${row.full_name}.` });
      loadRoster();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  function setMark(studentId, mark) {
    setStudents((rows) => rows.map((row) => row.student_id === studentId ? { ...row, mark } : row));
  }

  const selectedCourse = courses.find((course) => String(course.course_id) === courseId);

  return (
    <section className="page">
      <div className="page-head">
        <div><p className="eyebrow">ACADEMIC MANAGEMENT</p><h1>Attendance</h1><p className="muted">Record and review course attendance by class date.</p></div>
      </div>
      {message && <div className={`notice ${message.type}`} role="status">{message.text}</div>}
      <div className="panel">
        <div className="field-row">
          <div className="field">
            <label htmlFor="attendance-course">Course</label>
            <select id="attendance-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {!courses.length && <option value="">No courses available</option>}
              {courses.map((course) => <option key={course.course_id} value={course.course_id}>{course.course_code} · {course.course_name} (Sem {course.semester})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="attendance-date">Class date</label>
            <input id="attendance-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {selectedCourse && <p className="muted small-text">{selectedCourse.program_name} · {selectedCourse.credits} credits</p>}
      </div>

      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Enrollment no.</th><th>Student</th><th>Attendance</th><th>Course report</th><th>Action</th></tr></thead>
          <tbody>
            {students === null && <tr><td colSpan="5" className="muted">Loading attendance roster…</td></tr>}
            {students?.length === 0 && <tr><td colSpan="5" className="muted">No enrolled students are assigned to this course.</td></tr>}
            {students?.map((row) => (
              <tr key={row.student_id}>
                <td>{row.enrollment_no}</td>
                <td><b>{row.full_name}</b></td>
                <td>
                  <select aria-label={`Attendance for ${row.full_name}`} value={row.mark} onChange={(e) => setMark(row.student_id, e.target.value)}>
                    <option value="">Not marked</option>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </td>
                <td>{row.classes} classes · {row.attended} present
                  <div className={Number(row.classes) > 0 && Number(row.attendance_pct) < 75 ? 'text-bad small-text' : 'muted small-text'}>
                    {row.classes > 0 ? `${row.attendance_pct}%` : 'No classes recorded'}
                  </div>
                </td>
                <td><button className="primary small" disabled={!row.mark || busy === row.student_id} onClick={() => save(row)}>{busy === row.student_id ? 'Saving…' : 'Save'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small-text">Re-saving a student’s attendance for the same course and date updates that record; it does not create a duplicate.</p>
    </section>
  );
}
