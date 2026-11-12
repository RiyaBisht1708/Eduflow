package com.eduflow;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** seed.sql stores the placeholder RESET_ME as password; replace it with BCrypt("password123"). */
@Component
public class DataInitializer implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public DataInitializer(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        int n = jdbc.update("UPDATE users SET password_hash = ? WHERE password_hash = 'RESET_ME'",
                encoder.encode("password123"));
        if (n > 0) log.info("Set default password 'password123' for {} seeded users", n);
    }
}
