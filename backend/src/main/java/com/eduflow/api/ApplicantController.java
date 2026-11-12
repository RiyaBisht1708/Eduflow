package com.eduflow.api;

import com.eduflow.security.AuthUser;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Applicant portal: profile, application, documents, payment, status tracking. */
@RestController
@RequestMapping("/api")
public class ApplicantController {
    private static final Set<String> DOC_TYPES =
        Set.of("TENTH_MARKSHEET", "TWELFTH_MARKSHEET", "ID_PROOF", "PHOTO", "ENTRANCE_SCORECARD");
    private final JdbcTemplate jdbc;
    public ApplicantController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    record ApplyReq(Integer programId, Double tenthPct, Double twelfthPct, Double entranceScore, String address) {}
    record DocReq(String docType, String fileName) {}

    @GetMapping("/applications/mine")
    public List<Map<String, Object>> mine(@AuthenticationPrincipal AuthUser u) {
        return jdbc.queryForList(
            "SELECT a.application_id,a.status,a.priority,a.submitted_at,p.program_id,p.program_name," +
            "  (SELECT f.amount FROM fees f WHERE f.program_id=a.program_id AND f.fee_type='ADMISSION') AS admission_fee " +
            "FROM applications a JOIN students s ON s.student_id=a.student_id JOIN programs p ON p.program_id=a.program_id " +
            "WHERE s.user_id=? ORDER BY a.submitted_at DESC", u.userId());
    }

    @PostMapping("/applications")
    @Transactional
    public Map<String, Object> apply(@AuthenticationPrincipal AuthUser u, @RequestBody ApplyReq r) {
        if (r.programId() == null) bad(HttpStatus.BAD_REQUEST, "Choose a programme");
        if (!pct(r.tenthPct()) || !pct(r.twelfthPct())) bad(HttpStatus.BAD_REQUEST, "Marks must be percentages between 0 and 100");
        if (r.entranceScore() == null || r.entranceScore() < 0) bad(HttpStatus.BAD_REQUEST, "Enter your entrance score");

        jdbc.update("UPDATE students SET tenth_pct=?, twelfth_pct=?, entrance_score=?, address=? WHERE user_id=?",
                    r.tenthPct(), r.twelfthPct(), r.entranceScore(), r.address(), u.userId());
        Integer studentId = jdbc.queryForObject("SELECT student_id FROM students WHERE user_id=?", Integer.class, u.userId());

        // Priority 1 = most urgent. Higher entrance scores are processed first by the OS scheduler.
        int priority = (int) Math.max(1, Math.min(10, 11 - Math.floor(r.entranceScore() / 15.0)));
        try {
            Integer id = jdbc.queryForObject(
                "INSERT INTO applications(student_id,program_id,priority) VALUES (?,?,?) RETURNING application_id",
                Integer.class, studentId, r.programId(), priority);
            return Map.of("applicationId", id, "priority", priority);
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already applied to this programme");
        }
    }

    @GetMapping("/applications/{id}/documents")
    public List<Map<String, Object>> documents(@AuthenticationPrincipal AuthUser u, @PathVariable int id) {
        requireAccess(u, id);
        return jdbc.queryForList(
            "SELECT d.document_id,d.doc_type,d.file_name,d.uploaded_at,v.status AS verification_status,v.remarks " +
            "FROM documents d LEFT JOIN document_verifications v ON v.document_id=d.document_id " +
            "WHERE d.application_id=? ORDER BY d.doc_type", id);
    }

    /** Stores document metadata. Binary file storage is intentionally out of scope for v1. */
    @PostMapping("/applications/{id}/documents")
    @Transactional
    public Map<String, Object> upload(@AuthenticationPrincipal AuthUser u, @PathVariable int id, @RequestBody DocReq r) {
        requireOwner(u, id);
        if (r.docType() == null || !DOC_TYPES.contains(r.docType())) bad(HttpStatus.BAD_REQUEST, "Unknown document type");
        if (r.fileName() == null || r.fileName().isBlank()) bad(HttpStatus.BAD_REQUEST, "Choose a file");

        Integer docId = jdbc.queryForObject(
            "INSERT INTO documents(application_id,doc_type,file_name) VALUES (?,?,?) " +
            "ON CONFLICT (application_id,doc_type) DO UPDATE SET file_name=EXCLUDED.file_name, uploaded_at=now() " +
            "RETURNING document_id", Integer.class, id, r.docType(), r.fileName());
        jdbc.update("INSERT INTO document_verifications(document_id,status) VALUES (?, 'PENDING') " +
                    "ON CONFLICT (document_id) DO UPDATE SET status='PENDING', remarks=NULL, verified_at=NULL", docId);
        jdbc.update("UPDATE applications SET status='DOCS_PENDING' WHERE application_id=? AND status='SUBMITTED'", id);
        return Map.of("documentId", docId);
    }

    @GetMapping("/applications/{id}/history")
    public List<Map<String, Object>> history(@AuthenticationPrincipal AuthUser u, @PathVariable int id) {
        requireAccess(u, id);
        return jdbc.queryForList(
            "SELECT old_status,new_status,changed_at FROM application_status_history " +
            "WHERE application_id=? ORDER BY history_id", id);
    }

    /** Simulated payment (no real gateway in v1). Only allowed once the applicant is eligible. */
    @PostMapping("/applications/{id}/pay")
    @Transactional
    public Map<String, Object> pay(@AuthenticationPrincipal AuthUser u, @PathVariable int id) {
        requireOwner(u, id);
        List<Map<String, Object>> fee = jdbc.queryForList(
            "SELECT f.fee_id,f.amount FROM fees f JOIN applications a ON a.program_id=f.program_id " +
            "WHERE a.application_id=? AND a.status='PAYMENT_PENDING' AND f.fee_type='ADMISSION'", id);
        if (fee.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Payment opens after document verification and eligibility check");
        String txn = "TXN" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        jdbc.update("INSERT INTO payments(application_id,fee_id,amount,status,txn_ref) VALUES (?,?,?,'SUCCESS',?)",
                    id, fee.get(0).get("fee_id"), fee.get(0).get("amount"), txn);
        jdbc.update("UPDATE applications SET status='PAID' WHERE application_id=?", id);
        return Map.of("txnRef", txn, "amount", fee.get(0).get("amount"));
    }

    @GetMapping("/notifications")
    public List<Map<String, Object>> notifications(@AuthenticationPrincipal AuthUser u) {
        return jdbc.queryForList(
            "SELECT notification_id,message,is_read,created_at FROM notifications " +
            "WHERE user_id=? ORDER BY created_at DESC, notification_id DESC LIMIT 50", u.userId());
    }

    @PostMapping("/notifications/read-all")
    public Map<String, Object> readAll(@AuthenticationPrincipal AuthUser u) {
        return Map.of("updated", jdbc.update("UPDATE notifications SET is_read=TRUE WHERE user_id=? AND NOT is_read", u.userId()));
    }

    // ---- helpers ----
    private void requireOwner(AuthUser u, int appId) {
        Integer c = jdbc.queryForObject(
            "SELECT COUNT(*) FROM applications a JOIN students s ON s.student_id=a.student_id " +
            "WHERE a.application_id=? AND s.user_id=?", Integer.class, appId, u.userId());
        if (c == null || c == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This is not your application");
    }
    private void requireAccess(AuthUser u, int appId) {
        if (!"ADMIN".equals(u.role()) && !"COUNSELLOR".equals(u.role())) requireOwner(u, appId);
    }
    private static boolean pct(Double d) { return d != null && d >= 0 && d <= 100; }
    private static void bad(HttpStatus s, String m) { throw new ResponseStatusException(s, m); }
}
