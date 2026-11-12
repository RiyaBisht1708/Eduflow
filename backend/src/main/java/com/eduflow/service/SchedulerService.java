package com.eduflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Runs the C++ scheduling engine as a child process and returns its JSON report. */
@Service
public class SchedulerService {
    public record JobSpec(int id, String name, int arrival, int burst, int priority) {}

    private static final Set<String> ALGOS = Set.of("priority", "fcfs", "rr", "all");
    private final String enginePath;
    private final ObjectMapper mapper = new ObjectMapper();

    public SchedulerService(@Value("${eduflow.engine.path}") String enginePath) { this.enginePath = enginePath; }

    public JsonNode run(List<JobSpec> jobs, String algorithm, int quantum) {
        if (!ALGOS.contains(algorithm)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "algorithm must be one of " + ALGOS);
        if (jobs.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add at least one job");
        if (quantum < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Time quantum must be at least 1");

        try {
            Process p = new ProcessBuilder(enginePath, algorithm, String.valueOf(quantum), "--json").start();
            try (Writer w = new OutputStreamWriter(p.getOutputStream(), StandardCharsets.UTF_8)) {
                for (JobSpec j : jobs) {
                    String name = j.name().replaceAll("[^A-Za-z0-9_ -]", "");   // keep the CSV input well-formed
                    w.write(j.id() + "," + name + "," + j.arrival() + "," + j.burst() + "," + j.priority() + "\n");
                }
            }
            String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String err = new String(p.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!p.waitFor(10, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "Scheduler engine timed out");
            }
            if (p.exitValue() != 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scheduler error: " + err.trim());
            return mapper.readTree(out);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Scheduler engine not found at '" + enginePath + "'. Run `make` in the os-engine folder.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Interrupted");
        }
    }
}
