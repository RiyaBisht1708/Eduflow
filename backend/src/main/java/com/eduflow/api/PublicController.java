package com.eduflow.api;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/** Endpoints that need no login: programme catalogue and the enquiry (lead) form. */
@RestController
@RequestMapping("/api")
public class PublicController {
    private final JdbcTemplate jdbc;
    public PublicController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/programs")
    public List<Map<String, Object>> programs() {
        return jdbc.queryForList(
            "SELECT p.program_id,p.program_name,p.duration_yrs,p.annual_fee,d.dept_name," +
            "       s.total_seats,s.filled_seats,(s.total_seats-s.filled_seats) AS seats_left " +
            "FROM programs p JOIN departments d ON d.dept_id=p.dept_id LEFT JOIN seats s ON s.program_id=p.program_id " +
            "ORDER BY p.program_name");
    }

    record LeadReq(String name, String email, String phone, Integer programId) {}

    /** Creates a lead and assigns it to the counsellor who currently has the fewest open leads. */
    @PostMapping("/leads")
    public Map<String, Object> createLead(@RequestBody LeadReq r) {
        if (r.name() == null || r.name().isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        if ((r.email() == null || r.email().isBlank()) && (r.phone() == null || r.phone().isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide an email or a phone number");
        List<Integer> c = jdbc.queryForList(
            "SELECT c.counsellor_id FROM counsellors c LEFT JOIN leads l ON l.counsellor_id=c.counsellor_id AND l.status NOT IN ('APPLIED','LOST') " +
            "GROUP BY c.counsellor_id ORDER BY COUNT(l.lead_id), c.counsellor_id LIMIT 1", Integer.class);
        Integer counsellor = c.isEmpty() ? null : c.get(0);
        Integer id = jdbc.queryForObject(
            "INSERT INTO leads(name,email,phone,program_id,counsellor_id) VALUES (?,?,?,?,?) RETURNING lead_id",
            Integer.class, r.name().trim(), r.email(), r.phone(), r.programId(), counsellor);
        return Map.of("leadId", id, "message", "Thanks! A counsellor will contact you soon.");
    }
}
