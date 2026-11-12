package com.eduflow.api;

import com.eduflow.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Leads and counselling. Open to ADMIN and COUNSELLOR roles (see SecurityConfig). */
@RestController
@RequestMapping("/api/leads")
public class LeadController {
    private static final Set<String> STATUSES = Set.of("NEW", "CONTACTED", "INTERESTED", "APPLIED", "LOST");
    private final JdbcTemplate jdbc;
    public LeadController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    record StatusReq(String status) {}
    record FollowUpReq(String note, String nextDate) {}

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal AuthUser u) {
        String sql =
            "SELECT l.lead_id,l.name,l.email,l.phone,l.source,l.status,l.created_at,p.program_name,cu.full_name AS counsellor," +
            "  (SELECT MIN(f.next_date) FROM follow_ups f WHERE f.lead_id=l.lead_id AND NOT f.done) AS next_follow_up " +
            "FROM leads l LEFT JOIN programs p ON p.program_id=l.program_id " +
            "LEFT JOIN counsellors c ON c.counsellor_id=l.counsellor_id LEFT JOIN users cu ON cu.user_id=c.user_id ";
        // Counsellors see only their own leads; admins see everything.
        if ("COUNSELLOR".equals(u.role()))
            return jdbc.queryForList(sql + "WHERE c.user_id=? ORDER BY l.created_at DESC", u.userId());
        return jdbc.queryForList(sql + "ORDER BY l.created_at DESC");
    }

    @PatchMapping("/{id}/status")
    public Map<String, Object> setStatus(@PathVariable int id, @RequestBody StatusReq r) {
        if (r.status() == null || !STATUSES.contains(r.status()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status must be one of " + STATUSES);
        if (jdbc.update("UPDATE leads SET status=? WHERE lead_id=?", r.status(), id) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lead not found");
        return Map.of("status", r.status());
    }

    @GetMapping("/{id}/followups")
    public List<Map<String, Object>> followUps(@PathVariable int id) {
        return jdbc.queryForList(
            "SELECT followup_id,note,next_date,done,created_at FROM follow_ups WHERE lead_id=? ORDER BY created_at DESC", id);
    }

    @PostMapping("/{id}/followups")
    public Map<String, Object> addFollowUp(@AuthenticationPrincipal AuthUser u, @PathVariable int id, @RequestBody FollowUpReq r) {
        if (r.note() == null || r.note().isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Write a note for the follow-up");
        // Use the lead's assigned counsellor (admins may log follow-ups on behalf of them).
        List<Integer> c = jdbc.queryForList("SELECT counsellor_id FROM leads WHERE lead_id=? AND counsellor_id IS NOT NULL", Integer.class, id);
        if (c.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT, "This lead has no counsellor assigned yet");
        Integer fid = jdbc.queryForObject(
            "INSERT INTO follow_ups(lead_id,counsellor_id,note,next_date) VALUES (?,?,?,?::date) RETURNING followup_id",
            Integer.class, id, c.get(0), r.note().trim(), (r.nextDate() == null || r.nextDate().isBlank()) ? null : r.nextDate());
        jdbc.update("UPDATE leads SET status='CONTACTED' WHERE lead_id=? AND status='NEW'", id);
        return Map.of("followUpId", fid);
    }
}
