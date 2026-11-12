import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function Exams() {
  const [courses, setCourses] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [roster, setRoster] = useState(null);
  const [form, setForm] = useState({ courseId: '', examType: 'MIDTERM', examDate: today(), maxMarks: '100' });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const loadExams = useCallback(() => api('/admin/erp/exams').then((rows) => {
    setExams(rows);
    setExamId((current) => current || (rows.length ? String(rows[0].exam_id) : ''));
  }), []);

  useEffect(() => {
    Promise.all([api('/admin/erp/courses'), loadExams()])
      .then(([courseRows]) => {
        setCourses(courseRows);
        if (courseRows.length) setForm((current) => ({ ...current, courseId: current.courseId || String(courseRows[0].course_id) }));
      })
      .catch((e) => setMessage({ type: 'error', text: e.message }));
  }, [loadExams]);

  const loadRoster = useCallback(() => {
    if (!examId) {
      setRoster([]);
      return;
    }
    setRoster(null);
    api(`/admin/erp/exams/${encodeURIComponent(examId)}/roster`)
      .then((rows) => setRoster(rows.map((row) => ({ ...row, value: row.marks ?? '' }))))
      .catch((e) => {
        setRoster([]);
        setMessage({ type: 'error', text: e.message });
      });
  }, [examId]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  async function createExam(event) {
    event.preventDefault();
    setBusy('create');
    setMessage(null);
    try {
      const created = await api('/admin/erp/exams', {
        method: 'POST',
        body: { ...form, courseId: Number(form.courseId), maxMarks: Number(form.maxMarks) },
      });
      setExamId(String(created.examId));
      await loadExams();
      setMessage({ type: 'success', text: 'Examination created. Enter marks and publish results when ready.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function saveMarks(row) {
    const exam = exams.find((item) => String(item.exam_id) === examId);
    const marks = Number(row.value);
    if (row.value === '' || !Number.isFinite(marks) || marks < 0 || marks > Number(exam.max_marks)) {
      setMessage({ type: 'error', text: `Enter marks from 0 to ${exam.max_marks}.` });
      return;
    }
    setBusy(row.student_id);
    setMessage(null);
    try {
      await api('/admin/erp/results', { method: 'POST', body: { examId: Number(examId), studentId: row.student_id, marks } });
      setMessage({ type: 'success', text: `Marks saved for ${row.full_name}.` });
      loadRoster();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  async function setPublished(exam) {
    setBusy(`publish-${exam.exam_id}`);
    setMessage(null);
    try {
      await api(`/admin/erp/exams/${exam.exam_id}/publication`, {
        method: 'PUT',
        body: { published: !exam.is_published },
      });
      await loadExams();
      setMessage({ type: 'success', text: `Results ${exam.is_published ? 'hidden' : 'published'} for ${exam.course_code}.` });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const selectedExam = exams.find((exam) => String(exam.exam_id) === examId);

  return (
    <section className="page">
      <div className="page-head">
        <div><p className="eyebrow">ACADEMIC MANAGEMENT</p><h1>Examinations &amp; results</h1><p className="muted">Create exams, record marks, and control student result visibility.</p></div>
      </div>
      {message && <div className={`notice ${message.type}`} role="status">{message.text}</div>}

      <form className="panel" onSubmit={createExam}>
        <h2>Schedule an examination</h2>
        <div className="field-row">
          <div className="field"><label htmlFor="exam-course">Course</label>
            <select id="exam-course" required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              {courses.map((course) => <option key={course.course_id} value={course.course_id}>{course.course_code} · {course.course_name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="exam-type">Exam type</label>
            <select id="exam-type" value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
              <option value="MIDTERM">Midterm</option><option value="FINAL">Final</option><option value="QUIZ">Quiz</option>
            </select>
          </div>
          <div className="field"><label htmlFor="exam-date">Exam date</label>
            <input id="exam-date" type="date" required value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
          </div>
          <div className="field"><label htmlFor="exam-max">Maximum marks</label>
            <input id="exam-max" type="number" min="1" step="1" required value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
          </div>
        </div>
        <button className="primary" disabled={!courses.length || busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create examination'}</button>
      </form>

      <div className="panel table-wrap">
        <h2>Examination records</h2>
        <table>
          <thead><tr><th>Course</th><th>Exam</th><th>Date</th><th className="num">Maximum</th><th>Results</th><th>Visibility</th></tr></thead>
          <tbody>
            {exams.length === 0 && <tr><td colSpan="6" className="muted">No examinations have been scheduled.</td></tr>}
            {exams.map((exam) => (
              <tr key={exam.exam_id} className={examId === String(exam.exam_id) ? 'selected-row' : ''}>
                <td><b>{exam.course_code}</b><div className="muted small-text">{exam.course_name}</div></td>
                <td>{exam.exam_type}</td><td>{fmtDate(exam.exam_date)}</td><td className="num">{exam.max_marks}</td>
                <td><button className="ghost small" onClick={() => setExamId(String(exam.exam_id))}>Enter marks</button></td>
                <td><button className={exam.is_published ? 'danger small' : 'primary small'}
                  disabled={busy === `publish-${exam.exam_id}`} onClick={() => setPublished(exam)}>
                  {exam.is_published ? 'Unpublish' : 'Publish'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedExam && <div className="panel table-wrap">
        <h2>Marks entry · {selectedExam.course_code} {selectedExam.exam_type}</h2>
        <p className="muted small-text">Students see these marks only after results are published. Maximum: {selectedExam.max_marks}.</p>
        <table>
          <thead><tr><th>Enrollment no.</th><th>Student</th><th>Marks / {selectedExam.max_marks}</th><th>Action</th></tr></thead>
          <tbody>
            {roster === null && <tr><td colSpan="4" className="muted">Loading student roster…</td></tr>}
            {roster?.length === 0 && <tr><td colSpan="4" className="muted">No enrolled students are assigned to this course.</td></tr>}
            {roster?.map((row) => (
              <tr key={row.student_id}>
                <td>{row.enrollment_no}</td><td><b>{row.full_name}</b></td>
                <td><input aria-label={`Marks for ${row.full_name}`} type="number" min="0" max={selectedExam.max_marks} step="0.01"
                  value={row.value} onChange={(e) => setRoster((rows) => rows.map((item) => item.student_id === row.student_id ? { ...item, value: e.target.value } : item))} /></td>
                <td><button className="primary small" disabled={busy === row.student_id || selectedExam.is_published} onClick={() => saveMarks(row)}>
                  {busy === row.student_id ? 'Saving…' : 'Save marks'}
                </button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  );
}
