package com.eduflow.api;

import com.eduflow.security.AuthUser;
import com.eduflow.security.JwtUtil;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final JwtUtil jwt;

    public AuthController(JdbcTemplate jdbc, PasswordEncoder encoder, JwtUtil jwt) {
        this.jdbc = jdbc; this.encoder = encoder; this.jwt = jwt;
    }

    record RegisterReq(String fullName, String email, String phone, String password) {}
    record LoginReq(String email, String password) {}

    @PostMapping("/register")
    @Transactional
    public Map<String, Object> register(@RequestBody RegisterReq r) {
        if (r.fullName() == null || r.fullName().isBlank()) bad("Full name is required");
        if (r.email() == null || !r.email().matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) bad("Enter a valid email address");
        if (r.password() == null || r.password().length() < 8) bad("Password must be at least 8 characters");

        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE lower(email) = lower(?)", Integer.class, r.email());
        if (exists != null && exists > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");

        Integer uid = jdbc.queryForObject(
            "INSERT INTO users(full_name,email,phone,password_hash,role_id) " +
            "VALUES (?,?,?,?,(SELECT role_id FROM roles WHERE role_name='APPLICANT')) RETURNING user_id",
            Integer.class, r.fullName().trim(), r.email().trim().toLowerCase(), r.phone(), encoder.encode(r.password()));
        jdbc.update("INSERT INTO students(user_id) VALUES (?)", uid);
        return tokenFor(uid, r.fullName(), r.email().trim().toLowerCase(), "APPLICANT");
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginReq r) {
        Map<String, Object> row;
        try {
            row = jdbc.queryForMap(
                "SELECT u.user_id,u.full_name,u.email,u.password_hash,ro.role_name " +
                "FROM users u JOIN roles ro ON ro.role_id=u.role_id WHERE lower(u.email)=lower(?)", r.email());
        } catch (EmptyResultDataAccessException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect");
        }
        if (r.password() == null || !encoder.matches(r.password(), (String) row.get("password_hash")))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect");
        return tokenFor((Integer) row.get("user_id"), (String) row.get("full_name"),
                        (String) row.get("email"), (String) row.get("role_name"));
    }

    /** Fresh role from the DB: a token issued before enrollment still says APPLICANT. */
    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal AuthUser u) {
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT u.user_id,u.full_name,u.email,ro.role_name AS role, s.enrollment_no " +
            "FROM users u JOIN roles ro ON ro.role_id=u.role_id LEFT JOIN students s ON s.user_id=u.user_id " +
            "WHERE u.user_id=?", u.userId());
        row.put("token", jwt.create(new AuthUser(
            (Integer) row.get("user_id"), (String) row.get("email"), (String) row.get("role"))));
        return row;
    }

    private Map<String, Object> tokenFor(int id, String name, String email, String role) {
        String token = jwt.create(new AuthUser(id, email, role));
        return Map.of("token", token, "userId", id, "name", name, "email", email, "role", role);
    }

    private static void bad(String m) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, m); }
}
