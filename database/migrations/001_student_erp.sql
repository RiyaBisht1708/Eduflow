BEGIN;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS current_semester SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_current_semester_ck'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_current_semester_ck CHECK (current_semester BETWEEN 1 AND 12);
  END IF;
END $$;

ALTER TABLE examinations ADD COLUMN IF NOT EXISTS is_published BOOLEAN;
UPDATE examinations SET is_published = TRUE WHERE is_published IS NULL;
ALTER TABLE examinations ALTER COLUMN is_published SET DEFAULT FALSE;
ALTER TABLE examinations ALTER COLUMN is_published SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_course_date ON attendance(course_id, class_date);
CREATE INDEX IF NOT EXISTS idx_examinations_course_date ON examinations(course_id, exam_date);
CREATE INDEX IF NOT EXISTS idx_results_student_exam ON results(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_students_program_enrollment ON students(program_id, enrollment_no);

CREATE OR REPLACE FUNCTION validate_attendance_course() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM students s JOIN courses c ON c.course_id = NEW.course_id
    WHERE s.student_id = NEW.student_id AND s.program_id = c.program_id
      AND s.enrollment_no IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in the course programme'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_course_integrity ON attendance;
CREATE TRIGGER attendance_course_integrity
BEFORE INSERT OR UPDATE OF student_id, course_id ON attendance
FOR EACH ROW EXECUTE FUNCTION validate_attendance_course();

CREATE OR REPLACE FUNCTION validate_result_record() RETURNS trigger AS $$
DECLARE
  v_max_marks INT;
  v_program_id INT;
BEGIN
  SELECT e.max_marks, c.program_id INTO v_max_marks, v_program_id
  FROM examinations e JOIN courses c ON c.course_id = e.course_id
  WHERE e.exam_id = NEW.exam_id;

  IF v_max_marks IS NULL THEN
    RAISE EXCEPTION 'Examination does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.marks > v_max_marks THEN
    RAISE EXCEPTION 'Marks cannot exceed the examination maximum'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM students s
    WHERE s.student_id = NEW.student_id AND s.program_id = v_program_id
      AND s.enrollment_no IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in the examination programme'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS result_record_integrity ON results;
CREATE TRIGGER result_record_integrity
BEFORE INSERT OR UPDATE OF exam_id, student_id, marks ON results
FOR EACH ROW EXECUTE FUNCTION validate_result_record();

CREATE TABLE IF NOT EXISTS erp_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('ATTENDANCE','RESULT','EXAM')),
  entity_id INT NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_user_id INT REFERENCES users(user_id),
  old_data JSONB,
  new_data JSONB,
  recorded_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_audit_entity ON erp_audit_log(entity_type, entity_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION audit_erp_change() RETURNS trigger AS $$
DECLARE
  v_actor INT := NULLIF(current_setting('eduflow.actor_user_id', TRUE), '')::INT;
  v_id INT;
  v_type VARCHAR(20);
BEGIN
  v_type := CASE TG_TABLE_NAME
    WHEN 'examinations' THEN 'EXAM'
    WHEN 'results' THEN 'RESULT'
    ELSE 'ATTENDANCE'
  END;
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'attendance' THEN v_id := OLD.attendance_id;
    ELSIF TG_TABLE_NAME = 'results' THEN v_id := OLD.result_id;
    ELSE v_id := OLD.exam_id;
    END IF;
    INSERT INTO erp_audit_log(entity_type, entity_id, action, actor_user_id, old_data)
    VALUES (v_type, v_id, TG_OP, v_actor, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'attendance' THEN v_id := NEW.attendance_id;
  ELSIF TG_TABLE_NAME = 'results' THEN v_id := NEW.result_id;
  ELSE v_id := NEW.exam_id;
  END IF;
  INSERT INTO erp_audit_log(entity_type, entity_id, action, actor_user_id, old_data, new_data)
  VALUES (v_type, v_id, TG_OP, v_actor,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_audit ON attendance;
CREATE TRIGGER attendance_audit AFTER INSERT OR UPDATE OR DELETE ON attendance
FOR EACH ROW EXECUTE FUNCTION audit_erp_change();
DROP TRIGGER IF EXISTS results_audit ON results;
CREATE TRIGGER results_audit AFTER INSERT OR UPDATE OR DELETE ON results
FOR EACH ROW EXECUTE FUNCTION audit_erp_change();
DROP TRIGGER IF EXISTS examinations_audit ON examinations;
CREATE TRIGGER examinations_audit AFTER INSERT OR UPDATE OR DELETE ON examinations
FOR EACH ROW EXECUTE FUNCTION audit_erp_change();

CREATE OR REPLACE VIEW v_student_attendance_detail AS
SELECT s.student_id, s.enrollment_no, u.full_name, c.course_id, c.course_code, c.course_name,
       COUNT(a.attendance_id) AS classes,
       COUNT(a.attendance_id) FILTER (WHERE a.present) AS attended,
       COALESCE(ROUND(100.0 * COUNT(a.attendance_id) FILTER (WHERE a.present)
         / NULLIF(COUNT(a.attendance_id), 0), 1), 0) AS attendance_pct,
       c.semester
FROM students s
JOIN users u ON u.user_id = s.user_id
JOIN courses c ON c.program_id = s.program_id
LEFT JOIN attendance a ON a.student_id = s.student_id AND a.course_id = c.course_id
GROUP BY s.student_id, s.enrollment_no, u.full_name, c.course_id, c.course_code, c.course_name, c.semester;

CREATE OR REPLACE VIEW v_student_academic_summary AS
SELECT r.student_id, e.course_id, c.course_code, c.course_name, c.semester, c.credits,
       SUM(r.marks) AS marks_earned,
       SUM(e.max_marks) AS marks_available,
       ROUND(100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0), 2) AS percentage,
       CASE
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 90 THEN 10
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 80 THEN 9
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 70 THEN 8
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 60 THEN 7
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 50 THEN 6
         WHEN 100.0 * SUM(r.marks) / NULLIF(SUM(e.max_marks), 0) >= 40 THEN 5
         ELSE 0
       END AS grade_point
FROM results r
JOIN examinations e ON e.exam_id = r.exam_id AND e.is_published
JOIN courses c ON c.course_id = e.course_id
GROUP BY r.student_id, e.course_id, c.course_code, c.course_name, c.semester, c.credits;

CREATE OR REPLACE VIEW v_student_fee_summary AS
SELECT a.application_id, a.student_id, p.program_id, p.program_name,
       f.fee_id, f.fee_type, f.amount AS fee_amount,
       COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'SUCCESS'), 0) AS paid_amount,
       GREATEST(f.amount - COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'SUCCESS'), 0), 0) AS outstanding_amount
FROM applications a
JOIN programs p ON p.program_id = a.program_id
JOIN fees f ON f.program_id = p.program_id
LEFT JOIN payments pay ON pay.application_id = a.application_id AND pay.fee_id = f.fee_id
WHERE a.status = 'ENROLLED'
GROUP BY a.application_id, a.student_id, p.program_id, p.program_name, f.fee_id, f.fee_type, f.amount;

CREATE OR REPLACE FUNCTION erp_grade(p_marks NUMERIC, p_max_marks NUMERIC)
RETURNS TEXT AS $$
DECLARE v_pct NUMERIC;
BEGIN
  IF p_marks IS NULL OR p_max_marks IS NULL OR p_max_marks <= 0
     OR p_marks < 0 OR p_marks > p_max_marks THEN
    RAISE EXCEPTION 'Marks must be between zero and the maximum marks'
      USING ERRCODE = '22023';
  END IF;
  v_pct := 100 * p_marks / p_max_marks;
  RETURN CASE
    WHEN v_pct >= 90 THEN 'O'
    WHEN v_pct >= 80 THEN 'A+'
    WHEN v_pct >= 70 THEN 'A'
    WHEN v_pct >= 60 THEN 'B+'
    WHEN v_pct >= 50 THEN 'B'
    WHEN v_pct >= 40 THEN 'C'
    ELSE 'F'
  END;
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION erp_sgpa(p_student_id INT)
RETURNS NUMERIC AS $$
  SELECT ROUND(SUM(a.grade_point * a.credits)::NUMERIC / NULLIF(SUM(a.credits), 0), 2)
  FROM v_student_academic_summary a
  JOIN students s ON s.student_id = a.student_id
  WHERE a.student_id = p_student_id AND a.semester = s.current_semester;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION erp_cgpa(p_student_id INT)
RETURNS NUMERIC AS $$
  SELECT ROUND(SUM(grade_point * credits)::NUMERIC / NULLIF(SUM(credits), 0), 2)
  FROM v_student_academic_summary
  WHERE student_id = p_student_id;
$$ LANGUAGE sql STABLE;

COMMIT;
