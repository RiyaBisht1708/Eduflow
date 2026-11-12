package com.eduflow.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {
    private final SecretKey key;
    private final long expiryMs;

    public JwtUtil(@Value("${eduflow.jwt.secret}") String secret,
                   @Value("${eduflow.jwt.expiry-hours}") long hours) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiryMs = hours * 3_600_000L;
    }

    public String create(AuthUser u) {
        Date now = new Date();
        return Jwts.builder()
                .subject(u.email())
                .claim("uid", u.userId())
                .claim("role", u.role())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expiryMs))
                .signWith(key)
                .compact();
    }

    public AuthUser parse(String token) {
        Claims c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        return new AuthUser(c.get("uid", Integer.class), c.getSubject(), c.get("role", String.class));
    }
}
