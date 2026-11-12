package com.eduflow.api;

import com.eduflow.service.SchedulerService;
import com.eduflow.service.SchedulerService.JobSpec;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** OS-based admission processing: job queue + C++ scheduling engine. */
@RestController
@RequestMapping("/api/admin/scheduler")
public class SchedulerController {
    private final JdbcTemplate jdbc;
    private final SchedulerService engine;

    public SchedulerController(JdbcTemplate jdbc, SchedulerService engine) { this.jdbc = jdbc; this.engine = engine; }

    record JobReq(String name, Integer arrival, Integer burst, Integer priority) {}
    record RunReq(String algorithm, Integer quantum, List<JobReq> jobs) {}
    record NewJobReq(String jobType, Integer applicationId, Integer priority, Integer burstTime, Integer arrivalTime) {}

    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs() {
        return jdbc.queryForList(
            "SELECT job_id,job_type,application_id,priority,burst_time,arrival_time,state FROM scheduler_jobs ORDER BY job_id");
    }

    @PostMapping("/jobs")
    public Map<String, Object> addJob(@RequestBody NewJobReq r) {
        Integer id = jdbc.queryForObject(
            "INSERT INTO scheduler_jobs(job_type,application_id,priority,burst_time,arrival_time) VALUES (?,?,?,?,?) RETURNING job_id",
            Integer.class, r.jobType(), r.applicationId(),
            r.priority() == null ? 5 : r.priority(), r.burstTime(), r.arrivalTime() == null ? 0 : r.arrivalTime());
        return Map.of("jobId", id);
    }

    /** Runs the chosen algorithm on custom jobs from the request body, or on the queued jobs in the database. */
    @PostMapping("/run")
    public JsonNode run(@RequestBody RunReq r) {
        List<JobSpec> specs = new ArrayList<>();
        if (r.jobs() != null && !r.jobs().isEmpty()) {
            int n = 1;
            for (JobReq j : r.jobs())
                specs.add(new JobSpec(n++, j.name() == null ? "JOB" : j.name(),
                    j.arrival() == null ? 0 : j.arrival(), j.burst() == null ? 1 : j.burst(), j.priority() == null ? 5 : j.priority()));
        } else {
            for (Map<String, Object> m : jdbc.queryForList(
                    "SELECT job_id,job_type,priority,burst_time,arrival_time FROM scheduler_jobs WHERE state='QUEUED' ORDER BY job_id"))
                specs.add(new JobSpec(((Number) m.get("job_id")).intValue(), (String) m.get("job_type"),
                    ((Number) m.get("arrival_time")).intValue(), ((Number) m.get("burst_time")).intValue(),
                    ((Number) m.get("priority")).intValue()));
        }
        return engine.run(specs, r.algorithm() == null ? "all" : r.algorithm(), r.quantum() == null ? 2 : r.quantum());
    }
}
