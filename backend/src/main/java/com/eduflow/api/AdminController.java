package com.eduflow.api;

import com.eduflow.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Set;

/** Admin: application manager, document verification, eligibility, seat allocation, enrollment, statistics. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final JdbcTemplate jdbc;
    public AdminController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/applications")
    public List<Map<String, Object>> applications(@RequestParam(required = false) String status) {
        // Ordered by priority (1 = most urgent), then by arrival: the same order the Priority scheduler uses.
        if (status == null || status.isBlank())
            return jdbc.queryForList("SELECT * FROM v_application_detail ORDER BY priority, submitted_at");
        return jdbc.queryForList("SELECT * FROM v_application_detail WHERE status=? ORDER BY priority, submitted_at", status);
    }

    @PostMapping("/applications/{id}/verify-documents")
    @Transactional
    public Map<String, Object> verifyDocuments(@AuthenticationPrincipal AuthUser u, @PathVariable int id) {
        Integer required = jdbc.queryForObject(
            "SELECT COUNT(*) FROM documents WHERE application_id=? AND doc_type IN ('TENTH_MARKSHEET','TWELFTH_MARKSHEET','ID_PROOF')",
            Integer.class, id);
        if (required == null || required < 3)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Applicant must upload the 10th marksheet, 12th marksheet and ID proof first");
        transition(id, "DOCS_PENDING", "DOCS_VERIFIED");
        jdbc.update("UPDATE document_verifications v SET status='VERIFIED', verified_by=?, verified_at=now() " +
                    "FROM documents d WHERE v.document_id=d.document_id AND d.application_id=?", u.userId(), id);
        return Map.of("status", "DOCS_VERIFIED");
    }

    @PostMapping("/applications/{id}/check-eligibility")
    @Transactional
    public Map<String, Object> checkEligibility(@PathVariable int id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT s.tenth_pct,s.twelfth_pct,s.entrance_score,r.min_tenth_pct,r.min_twelfth_pct,r.min_entrance " +
            "FROM applications a JOIN students s ON s.student_id=a.student_id " +
            "JOIN eligibility_rules r ON r.program_id=a.program_id WHERE a.application_id=?", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No eligibility rule configured for this programme");
        Map<String, Object> m = rows.get(0);

        List<String> reasons = new ArrayList<>();
        if (num(m.get("tenth_pct")) < num(m.get("min_tenth_pct")))
            reasons.add("10th marks " + num(m.get("tenth_pct")) + "% are below the required " + num(m.get("min_tenth_pct")) + "%");
        if (num(m.get("twelfth_pct")) < num(m.get("min_twelfth_pct")))
            reasons.add("12th marks " + num(m.get("twelfth_pct")) + "% are below the required " + num(m.get("min_twelfth_pct")) + "%");
        if (num(m.get("entrance_score")) < num(m.get("min_entrance")))
            reasons.add("Entrance score " + num(m.get("entrance_score")) + " is below the required " + num(m.get("min_entrance")));

        boolean eligible = reasons.isEmpty();
        if (eligible) {
            transition(id, "DOCS_VERIFIED", "ELIGIBLE");
            transition(id, "ELIGIBLE", "PAYMENT_PENDING");   // eligible applicants move straight to payment
        } else {
            transition(id, "DOCS_VERIFIED", "NOT_ELIGIBLE");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("eligible", eligible);
        out.put("reasons", reasons);
        return out;
    }

    /** Calls the allocate_seat() PL/pgSQL function: row-level locks make this safe under concurrency. */
    @PostMapping("/applications/{id}/allocate-seat")
    @Transactional
    public Map<String, Object> allocateSeat(@AuthenticationPrincipal AuthUser u, @PathVariable int id) {
        String result = jdbc.queryForObject("SELECT allocate_seat(?, ?)", String.class, id, u.userId());
        if ("APPLICATION_NOT_FOUND".equals(result)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found");
        if ("PAYMENT_REQUIRED".equals(result)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Seat can only be allocated after payment");
        return Map.of("result", result);
    }

    @PostMapping("/applications/{id}/enroll")
    @Transactional
    public Map<String, Object> enroll(@PathVariable int id) {
        String result = jdbc.queryForObject("SELECT enroll_student(?)", String.class, id);
        if ("NOT_ADMITTED".equals(result)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only admitted applicants can be enrolled");
        return Map.of("enrollmentNo", result);
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("programs", jdbc.queryForList("SELECT * FROM v_admission_stats ORDER BY program_name"));
        out.put("funnel", jdbc.queryForList("SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY count DESC"));
        out.put("totals", jdbc.queryForMap(
            "SELECT (SELECT COUNT(*) FROM applications) AS applications," +
            "       (SELECT COUNT(*) FROM leads) AS leads," +
            "       (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='SUCCESS') AS revenue," +
            "       (SELECT COUNT(*) FROM students WHERE enrollment_no IS NOT NULL) AS enrolled," +
            "       (SELECT COUNT(*) FROM programs) AS programs," +
            "       (SELECT COUNT(DISTINCT student_id) FROM applications) AS applicants"));
        out.put("attendance", jdbc.queryForMap(
            "SELECT COUNT(*) AS classes, " +
            "COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE present) / NULLIF(COUNT(*),0),1),0) AS attendance_pct " +
            "FROM attendance"));
        out.put("recentApplications", jdbc.queryForList(
            "SELECT application_id,full_name,email,program_name,status,submitted_at " +
            "FROM v_application_detail ORDER BY submitted_at DESC LIMIT 5"));
        return out;
    }

    // ---- basic ERP (admin side) ----
    record AttendanceReq(Integer studentId, Integer courseId, String date, Boolean present) {}
    record ResultReq(Integer examId, Integer studentId, Double marks) {}
    record ExamReq(Integer courseId, String examType, String examDate, Integer maxMarks) {}
    record PublicationReq(Boolean published) {}
    record AcademicReq(Integer programId, Integer currentSemester) {}

    @PostMapping("/erp/attendance")
    @Transactional
    public Map<String, Object> markAttendance(@AuthenticationPrincipal AuthUser u, @RequestBody AttendanceReq r) {
        LocalDate classDate = parseDate(r.date(), "Attendance date");
        if (classDate.isAfter(LocalDate.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attendance date cannot be in the future");
        if (r.studentId() == null || r.courseId() == null || r.present() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Student, course and attendance status are required");
        Integer valid = jdbc.queryForObject(
            "SELECT COUNT(*) FROM students s JOIN courses c ON c.course_id=? " +
            "WHERE s.student_id=? AND s.program_id=c.program_id AND s.enrollment_no IS NOT NULL",
            Integer.class, r.courseId(), r.studentId());
        if (valid == null || valid == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Student must be enrolled in the course programme");
        setAuditActor(u);
        jdbc.update("INSERT INTO attendance(student_id,course_id,class_date,present) VALUES (?,?,?::date,?) " +
                    "ON CONFLICT (student_id,course_id,class_date) DO UPDATE SET present=EXCLUDED.present",
                    r.studentId(), r.courseId(), r.date(), r.present());
        return Map.of("saved", true);
    }

    @GetMapping("/erp/courses")
    public List<Map<String, Object>> courses() {
        return jdbc.queryForList(
            "SELECT c.course_id,c.course_code,c.course_name,c.semester,c.credits,p.program_name " +
            "FROM courses c JOIN programs p ON p.program_id=c.program_id ORDER BY p.program_name,c.semester,c.course_code");
    }

    @GetMapping("/erp/roster")
    public List<Map<String, Object>> roster(@RequestParam Integer courseId, @RequestParam String date) {
        LocalDate classDate = parseDate(date, "Attendance date");
        return jdbc.queryForList(
            "SELECT s.student_id,s.enrollment_no,u.full_name,a.present," +
            "COALESCE(v.classes,0) AS classes,COALESCE(v.attended,0) AS attended,COALESCE(v.pct,0) AS attendance_pct " +
            "FROM students s JOIN users u ON u.user_id=s.user_id " +
            "JOIN courses c ON c.program_id=s.program_id " +
            "LEFT JOIN attendance a ON a.student_id=s.student_id AND a.course_id=c.course_id AND a.class_date=?::date " +
            "LEFT JOIN v_attendance_summary v ON v.student_id=s.student_id AND v.course_id=c.course_id " +
            "WHERE c.course_id=? AND s.enrollment_no IS NOT NULL ORDER BY u.full_name",
            date, courseId);
    }

    @PostMapping("/erp/results")
    @Transactional
    public Map<String, Object> saveResult(@AuthenticationPrincipal AuthUser u, @RequestBody ResultReq r) {
        if (r.examId() == null || r.studentId() == null || r.marks() == null || r.marks() < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Examination, student and non-negative marks are required");
        List<Map<String, Object>> exams = jdbc.queryForList(
            "SELECT e.max_marks,c.program_id FROM examinations e JOIN courses c ON c.course_id=e.course_id WHERE e.exam_id=?",
            r.examId());
        if (exams.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Examination not found");
        int maxMarks = ((Number) exams.get(0).get("max_marks")).intValue();
        if (r.marks() > maxMarks)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Marks cannot exceed " + maxMarks);
        Integer studentMatches = jdbc.queryForObject(
            "SELECT COUNT(*) FROM students WHERE student_id=? AND program_id=? AND enrollment_no IS NOT NULL",
            Integer.class, r.studentId(), exams.get(0).get("program_id"));
        if (studentMatches == null || studentMatches == 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Student must be enrolled in the examination programme");
        setAuditActor(u);
        jdbc.update("INSERT INTO results(exam_id,student_id,marks) VALUES (?,?,?) " +
                    "ON CONFLICT (exam_id,student_id) DO UPDATE SET marks=EXCLUDED.marks",
                    r.examId(), r.studentId(), r.marks());
        return Map.of("saved", true);
    }

    @PostMapping("/erp/exams")
    @Transactional
    public Map<String, Object> createExam(@AuthenticationPrincipal AuthUser u, @RequestBody ExamReq r) {
        if (r.courseId() == null || r.maxMarks() == null || r.maxMarks() <= 0 ||
            r.examType() == null || !Set.of("MIDTERM", "FINAL", "QUIZ").contains(r.examType()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a course, valid exam type and positive maximum marks");
        Integer courseExists = jdbc.queryForObject("SELECT COUNT(*) FROM courses WHERE course_id=?", Integer.class, r.courseId());
        if (courseExists == null || courseExists == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found");
        LocalDate examDate = parseDate(r.examDate(), "Examination date");
        setAuditActor(u);
        Integer id = jdbc.queryForObject(
            "INSERT INTO examinations(course_id,exam_type,exam_date,max_marks) VALUES (?,?,?,?) RETURNING exam_id",
            Integer.class, r.courseId(), r.examType(), examDate, r.maxMarks());
        return Map.of("examId", id, "published", false);
    }

    @GetMapping("/erp/exams")
    public List<Map<String, Object>> examinations() {
        return jdbc.queryForList(
            "SELECT e.exam_id,e.exam_type,e.exam_date,e.max_marks,e.is_published," +
            "c.course_id,c.course_code,c.course_name,c.semester,c.credits,p.program_name " +
            "FROM examinations e JOIN courses c ON c.course_id=e.course_id " +
            "JOIN programs p ON p.program_id=c.program_id ORDER BY e.exam_date DESC,e.exam_id DESC");
    }

    @GetMapping("/erp/exams/{id}/roster")
    public List<Map<String, Object>> examRoster(@PathVariable int id) {
        return jdbc.queryForList(
            "SELECT s.student_id,s.enrollment_no,u.full_name,r.marks " +
            "FROM examinations e JOIN courses c ON c.course_id=e.course_id " +
            "JOIN students s ON s.program_id=c.program_id AND s.enrollment_no IS NOT NULL " +
            "JOIN users u ON u.user_id=s.user_id " +
            "LEFT JOIN results r ON r.exam_id=e.exam_id AND r.student_id=s.student_id " +
            "WHERE e.exam_id=? ORDER BY u.full_name", id);
    }

    @PutMapping("/erp/exams/{id}/publication")
    @Transactional
    public Map<String, Object> publishExam(@AuthenticationPrincipal AuthUser u, @PathVariable int id, @RequestBody PublicationReq r) {
        if (r.published() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Publication status is required");
        setAuditActor(u);
        if (jdbc.update("UPDATE examinations SET is_published=? WHERE exam_id=?", r.published(), id) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Examination not found");
        return Map.of("published", r.published());
    }

    @GetMapping("/students")
    public List<Map<String, Object>> students(@RequestParam(required = false) String q,
                                              @RequestParam(required = false) Integer programId) {
        StringBuilder sql = new StringBuilder(
            "SELECT s.student_id,s.enrollment_no,u.full_name,u.email,p.program_id,p.program_name," +
            "d.dept_name,s.current_semester FROM students s JOIN users u ON u.user_id=s.user_id " +
            "JOIN programs p ON p.program_id=s.program_id JOIN departments d ON d.dept_id=p.dept_id " +
            "WHERE s.enrollment_no IS NOT NULL");
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            sql.append(" AND (LOWER(u.full_name) LIKE ? OR LOWER(s.enrollment_no) LIKE ?)");
            String pattern = "%" + q.trim().toLowerCase() + "%";
            args.add(pattern);
            args.add(pattern);
        }
        if (programId != null) {
            sql.append(" AND p.program_id=?");
            args.add(programId);
        }
        sql.append(" ORDER BY u.full_name");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    @GetMapping("/students/{id}")
    public Map<String, Object> student(@PathVariable int id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT s.student_id,s.enrollment_no,s.current_semester,s.dob,s.gender,s.address," +
            "u.full_name,u.email,u.phone,p.program_id,p.program_name,d.dept_id,d.dept_name " +
            "FROM students s JOIN users u ON u.user_id=s.user_id " +
            "JOIN programs p ON p.program_id=s.program_id JOIN departments d ON d.dept_id=p.dept_id " +
            "WHERE s.student_id=? AND s.enrollment_no IS NOT NULL", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Enrolled student not found");
        return rows.get(0);
    }

    @PutMapping("/students/{id}/academic")
    public Map<String, Object> updateStudentAcademic(@PathVariable int id, @RequestBody AcademicReq r) {
        if (r.programId() == null || r.currentSemester() == null ||
            r.currentSemester() < 1 || r.currentSemester() > 12)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Programme and semester (1–12) are required");
        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM programs WHERE program_id=?", Integer.class, r.programId());
        if (exists == null || exists == 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Programme not found");
        Integer studentExists = jdbc.queryForObject(
            "SELECT COUNT(*) FROM students WHERE student_id=? AND enrollment_no IS NOT NULL", Integer.class, id);
        if (studentExists == null || studentExists == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Enrolled student not found");
        Integer academicRecords = jdbc.queryForObject(
            "SELECT (SELECT COUNT(*) FROM attendance WHERE student_id=?) + " +
            "(SELECT COUNT(*) FROM results WHERE student_id=?)", Integer.class, id, id);
        Integer currentProgram = jdbc.queryForObject("SELECT program_id FROM students WHERE student_id=?", Integer.class, id);
        if (!r.programId().equals(currentProgram) && academicRecords != null && academicRecords > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Programme cannot be changed after academic records exist");
        jdbc.update("UPDATE students SET program_id=?,current_semester=? WHERE student_id=?",
            r.programId(), r.currentSemester(), id);
        return Map.of("saved", true);
    }

    // ---- helpers ----
    /** Moves an application from one status to another, or fails with 409 if it is in a different state. */
    private void transition(int id, String from, String to) {
        int n = jdbc.update("UPDATE applications SET status=? WHERE application_id=? AND status=?", to, id, from);
        if (n == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Application must be in status " + from + " for this step");
    }
    private static double num(Object o) { return o == null ? 0 : ((Number) o).doubleValue(); }
    private static LocalDate parseDate(String value, String label) {
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " must use YYYY-MM-DD");
        }
    }
    private void setAuditActor(AuthUser u) {
        jdbc.queryForObject("SELECT set_config('eduflow.actor_user_id', ?, TRUE)", String.class, Integer.toString(u.userId()));
    }
}
