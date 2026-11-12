package com.eduflow.api;

import com.eduflow.security.AuthUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Student ERP (read side): profile, attendance, examinations and results for the logged-in student. */
@RestController
@RequestMapping("/api/erp")
public class ErpController {
    private final JdbcTemplate jdbc;
    public ErpController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/profile")
    public Map<String, Object> profile(@AuthenticationPrincipal AuthUser u) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT s.student_id,s.enrollment_no,s.current_semester,s.dob,s.gender,s.address," +
            "u.full_name,u.email,p.program_name,d.dept_name,erp_sgpa(s.student_id) AS sgpa," +
            "erp_cgpa(s.student_id) AS cgpa " +
            "FROM students s JOIN users u ON u.user_id=s.user_id " +
            "LEFT JOIN programs p ON p.program_id=s.program_id " +
            "LEFT JOIN departments d ON d.dept_id=p.dept_id WHERE s.user_id=?", u.userId());
        if (rows.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, "Student profile is not available");
        return rows.get(0);
    }

    @GetMapping("/attendance")
    public List<Map<String, Object>> attendance(@AuthenticationPrincipal AuthUser u) {
        return jdbc.queryForList(
            "SELECT v.course_code,v.course_name,v.classes,v.attended,v.attendance_pct AS pct " +
            "FROM v_student_attendance_detail v JOIN students s ON s.student_id=v.student_id " +
            "WHERE s.user_id=? AND v.semester=s.current_semester ORDER BY v.course_code", u.userId());
    }

    @GetMapping("/results")
    public List<Map<String, Object>> results(@AuthenticationPrincipal AuthUser u) {
        return jdbc.queryForList(
            "SELECT c.course_code,c.course_name,c.credits,e.exam_type,e.exam_date,e.max_marks,r.marks," +
            "erp_grade(r.marks,e.max_marks) AS grade " +
            "FROM results r JOIN examinations e ON e.exam_id=r.exam_id JOIN courses c ON c.course_id=e.course_id " +
            "JOIN students s ON s.student_id=r.student_id " +
            "WHERE s.user_id=? AND e.is_published ORDER BY e.exam_date DESC,c.course_code", u.userId());
    }

    @GetMapping("/exams")
    public List<Map<String, Object>> exams(@AuthenticationPrincipal AuthUser u) {
        return jdbc.queryForList(
            "SELECT c.course_code,c.course_name,c.credits,c.semester,e.exam_id,e.exam_type,e.exam_date,e.max_marks " +
            "FROM examinations e JOIN courses c ON c.course_id=e.course_id " +
            "JOIN students s ON s.program_id=c.program_id WHERE s.user_id=? AND e.exam_date >= CURRENT_DATE ORDER BY e.exam_date", u.userId());
    }

    @GetMapping("/fees")
    public Map<String, Object> fees(@AuthenticationPrincipal AuthUser u) {
        List<Map<String, Object>> feeRows = jdbc.queryForList(
            "SELECT application_id,program_name,fee_type,fee_amount,paid_amount,outstanding_amount " +
            "FROM v_student_fee_summary WHERE student_id=(SELECT student_id FROM students WHERE user_id=?) " +
            "ORDER BY application_id,fee_type", u.userId());
        List<Map<String, Object>> transactions = jdbc.queryForList(
            "SELECT pay.payment_id,pay.application_id,f.fee_type,pay.amount,pay.mode,pay.status," +
            "pay.txn_ref,pay.paid_at FROM payments pay JOIN fees f ON f.fee_id=pay.fee_id " +
            "JOIN applications a ON a.application_id=pay.application_id " +
            "JOIN students s ON s.student_id=a.student_id WHERE s.user_id=? " +
            "ORDER BY pay.paid_at DESC,pay.payment_id DESC", u.userId());
        return Map.of("fees", feeRows, "transactions", transactions);
    }
}
