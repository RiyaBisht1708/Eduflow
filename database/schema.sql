-- EduFlow – PostgreSQL schema (3NF)
-- Setup:
--   psql -U postgres -c "CREATE DATABASE eduflow;"
--   psql -U postgres -d eduflow -f schema.sql -f seed.sql

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- ---------- Identity ----------
CREATE TABLE roles (
  role_id   SERIAL PRIMARY KEY,
  role_name VARCHAR(30) UNIQUE NOT NULL
            CHECK (role_name IN ('ADMIN','COUNSELLOR','APPLICANT','STUDENT'))
);

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(120) UNIQUE NOT NULL,
  phone         VARCHAR(15),
  password_hash VARCHAR(100) NOT NULL,
  role_id       INT NOT NULL REFERENCES roles(role_id),
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  dept_id   SERIAL PRIMARY KEY,
  dept_name VARCHAR(80) UNIQUE NOT NULL
);

CREATE TABLE programs (
  program_id   SERIAL PRIMARY KEY,
  dept_id      INT NOT NULL REFERENCES departments(dept_id),
  program_name VARCHAR(100) NOT NULL,
  duration_yrs INT NOT NULL CHECK (duration_yrs BETWEEN 1 AND 6),
  annual_fee   NUMERIC(10,2) NOT NULL CHECK (annual_fee >= 0),
  UNIQUE (dept_id, program_name)
);

CREATE TABLE courses (
  course_id   SERIAL PRIMARY KEY,
  program_id  INT NOT NULL REFERENCES programs(program_id),
  course_code VARCHAR(15) UNIQUE NOT NULL,
  course_name VARCHAR(100) NOT NULL,
  semester    INT NOT NULL CHECK (semester BETWEEN 1 AND 12),
  credits     INT NOT NULL CHECK (credits > 0)
);

CREATE TABLE counsellors (
  counsellor_id SERIAL PRIMARY KEY,
  user_id       INT UNIQUE NOT NULL REFERENCES users(user_id),
  dept_id       INT REFERENCES departments(dept_id)
);

CREATE TABLE students (
  student_id     SERIAL PRIMARY KEY,
  user_id        INT UNIQUE NOT NULL REFERENCES users(user_id),
  dob            DATE,
  gender         VARCHAR(10),
  address        TEXT,
  tenth_pct      NUMERIC(5,2) CHECK (tenth_pct BETWEEN 0 AND 100),
  twelfth_pct    NUMERIC(5,2) CHECK (twelfth_pct BETWEEN 0 AND 100),
  entrance_score NUMERIC(6,2),
  enrollment_no  VARCHAR(20) UNIQUE,
  program_id     INT REFERENCES programs(program_id)   -- set at enrollment
);

-- ---------- Leads & counselling ----------
CREATE TABLE leads (
  lead_id       SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(120),
  phone         VARCHAR(15),
  source        VARCHAR(40) DEFAULT 'WEBSITE',
  program_id    INT REFERENCES programs(program_id),
  counsellor_id INT REFERENCES counsellors(counsellor_id),
  status        VARCHAR(20) NOT NULL DEFAULT 'NEW'
                CHECK (status IN ('NEW','CONTACTED','INTERESTED','APPLIED','LOST')),
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE follow_ups (
  followup_id   SERIAL PRIMARY KEY,
  lead_id       INT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
  counsellor_id INT NOT NULL REFERENCES counsellors(counsellor_id),
  note          TEXT,
  next_date     DATE,
  done          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Applications ----------
CREATE TABLE applications (
  application_id SERIAL PRIMARY KEY,
  student_id     INT NOT NULL REFERENCES students(student_id),
  program_id     INT NOT NULL REFERENCES programs(program_id),
  lead_id        INT REFERENCES leads(lead_id),
  status         VARCHAR(25) NOT NULL DEFAULT 'SUBMITTED'
                 CHECK (status IN ('SUBMITTED','DOCS_PENDING','DOCS_VERIFIED','ELIGIBLE','NOT_ELIGIBLE',
                                   'PAYMENT_PENDING','PAID','ADMITTED','REJECTED','ENROLLED')),
  priority       INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  submitted_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, program_id)
);

CREATE TABLE application_status_history (
  history_id     SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  old_status     VARCHAR(25),
  new_status     VARCHAR(25) NOT NULL,
  changed_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Documents ----------
CREATE TABLE documents (
  document_id    SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  doc_type       VARCHAR(30) NOT NULL
                 CHECK (doc_type IN ('TENTH_MARKSHEET','TWELFTH_MARKSHEET','ID_PROOF','PHOTO','ENTRANCE_SCORECARD')),
  file_name      VARCHAR(200) NOT NULL,
  uploaded_at    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (application_id, doc_type)
);

CREATE TABLE document_verifications (
  verification_id SERIAL PRIMARY KEY,
  document_id     INT UNIQUE NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  verified_by     INT REFERENCES users(user_id),
  status          VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  remarks         TEXT,
  verified_at     TIMESTAMP
);

-- ---------- Eligibility ----------
CREATE TABLE eligibility_rules (
  rule_id         SERIAL PRIMARY KEY,
  program_id      INT UNIQUE NOT NULL REFERENCES programs(program_id),
  min_twelfth_pct NUMERIC(5,2) NOT NULL,
  min_tenth_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_entrance    NUMERIC(6,2) NOT NULL DEFAULT 0
);

-- ---------- Seats & admission ----------
CREATE TABLE seats (
  seat_id      SERIAL PRIMARY KEY,
  program_id   INT UNIQUE NOT NULL REFERENCES programs(program_id),
  total_seats  INT NOT NULL CHECK (total_seats >= 0),
  filled_seats INT NOT NULL DEFAULT 0,
  CONSTRAINT seats_not_overbooked CHECK (filled_seats <= total_seats)
);

CREATE TABLE admissions (
  admission_id   SERIAL PRIMARY KEY,
  application_id INT UNIQUE NOT NULL REFERENCES applications(application_id),
  decision       VARCHAR(10) NOT NULL CHECK (decision IN ('ADMITTED','REJECTED')),
  seat_allotted  BOOLEAN NOT NULL DEFAULT FALSE,
  decided_by     INT REFERENCES users(user_id),
  decided_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Fees & payments ----------
CREATE TABLE fees (
  fee_id     SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(program_id),
  fee_type   VARCHAR(30) NOT NULL,            -- APPLICATION, ADMISSION
  amount     NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (program_id, fee_type)
);

CREATE TABLE payments (
  payment_id     SERIAL PRIMARY KEY,
  application_id INT NOT NULL REFERENCES applications(application_id),
  fee_id         INT NOT NULL REFERENCES fees(fee_id),
  amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  mode           VARCHAR(15) NOT NULL DEFAULT 'ONLINE',
  status         VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','SUCCESS','FAILED')),
  txn_ref        VARCHAR(40) UNIQUE,
  paid_at        TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Basic ERP ----------
CREATE TABLE attendance (
  attendance_id SERIAL PRIMARY KEY,
  student_id    INT NOT NULL REFERENCES students(student_id),
  course_id     INT NOT NULL REFERENCES courses(course_id),
  class_date    DATE NOT NULL,
  present       BOOLEAN NOT NULL,
  UNIQUE (student_id, course_id, class_date)
);

CREATE TABLE examinations (
  exam_id   SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(course_id),
  exam_type VARCHAR(20) NOT NULL CHECK (exam_type IN ('MIDTERM','FINAL','QUIZ')),
  exam_date DATE NOT NULL,
  max_marks INT NOT NULL CHECK (max_marks > 0)
);

CREATE TABLE results (
  result_id  SERIAL PRIMARY KEY,
  exam_id    INT NOT NULL REFERENCES examinations(exam_id),
  student_id INT NOT NULL REFERENCES students(student_id),
  marks      NUMERIC(6,2) NOT NULL CHECK (marks >= 0),
  UNIQUE (exam_id, student_id)
);

CREATE TABLE notifications (
  notification_id SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(user_id),
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------- Job queue consumed by the OS scheduling engine ----------
CREATE TABLE scheduler_jobs (
  job_id         SERIAL PRIMARY KEY,
  job_type       VARCHAR(30) NOT NULL
                 CHECK (job_type IN ('DOC_VERIFY','ELIGIBILITY','PAYMENT_VERIFY','STATUS_UPDATE','NOTIFY')),
  application_id INT REFERENCES applications(application_id),
  priority       INT NOT NULL DEFAULT 5,
  burst_time     INT NOT NULL CHECK (burst_time > 0),
  arrival_time   INT NOT NULL DEFAULT 0,
  state          VARCHAR(10) NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','RUNNING','DONE'))
);

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX idx_app_status   ON applications(status);
CREATE INDEX idx_app_program  ON applications(program_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_payments_app ON payments(application_id);
CREATE INDEX idx_notif_user   ON notifications(user_id, is_read);

-- =====================================================================
-- TRIGGERS
-- =====================================================================
-- 1) Record every application status change
CREATE OR REPLACE FUNCTION trg_log_status() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO application_status_history(application_id, old_status, new_status)
    VALUES (NEW.application_id, NULL, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO application_status_history(application_id, old_status, new_status)
    VALUES (NEW.application_id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER app_status_log
AFTER INSERT OR UPDATE OF status ON applications
FOR EACH ROW EXECUTE FUNCTION trg_log_status();

-- 2) Notify the applicant when status changes
CREATE OR REPLACE FUNCTION trg_notify_status() RETURNS trigger AS $$
DECLARE uid INT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT s.user_id INTO uid FROM students s WHERE s.student_id = NEW.student_id;
    INSERT INTO notifications(user_id, message)
    VALUES (uid, 'Application #' || NEW.application_id || ' is now ' || NEW.status);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER app_status_notify
AFTER UPDATE OF status ON applications
FOR EACH ROW EXECUTE FUNCTION trg_notify_status();

-- =====================================================================
-- VIEWS
-- =====================================================================
CREATE VIEW v_admission_stats AS
SELECT p.program_id, p.program_name,
       COUNT(a.application_id)                                          AS total_applications,
       COUNT(*) FILTER (WHERE a.status = 'ADMITTED')                    AS admitted,
       COUNT(*) FILTER (WHERE a.status = 'ENROLLED')                    AS enrolled,
       COUNT(*) FILTER (WHERE a.status IN ('REJECTED','NOT_ELIGIBLE'))  AS rejected,
       s.total_seats, s.filled_seats, (s.total_seats - s.filled_seats)  AS seats_left
FROM programs p
LEFT JOIN applications a ON a.program_id = p.program_id
LEFT JOIN seats s        ON s.program_id = p.program_id
GROUP BY p.program_id, p.program_name, s.total_seats, s.filled_seats;

CREATE VIEW v_application_detail AS
SELECT a.application_id, u.full_name, u.email, p.program_name, a.status, a.priority, a.submitted_at
FROM applications a
JOIN students st ON st.student_id = a.student_id
JOIN users u     ON u.user_id = st.user_id
JOIN programs p  ON p.program_id = a.program_id;

CREATE VIEW v_attendance_summary AS
SELECT student_id, course_id,
       COUNT(*) AS classes,
       SUM(CASE WHEN present THEN 1 ELSE 0 END) AS attended,
       ROUND(100.0 * SUM(CASE WHEN present THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct
FROM attendance GROUP BY student_id, course_id;

-- =====================================================================
-- FUNCTIONS: concurrency-safe seat allocation (ACID demo)
-- =====================================================================
-- SELECT ... FOR UPDATE takes a row-level lock on the seats row, so two
-- concurrent transactions cannot both take the last seat. The CHECK
-- constraint seats_not_overbooked is a second safety net.
CREATE OR REPLACE FUNCTION allocate_seat(p_application_id INT, p_admin INT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  v_program INT; v_status VARCHAR; v_total INT; v_filled INT;
BEGIN
  SELECT program_id, status INTO v_program, v_status
  FROM applications WHERE application_id = p_application_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN 'APPLICATION_NOT_FOUND'; END IF;
  IF v_status <> 'PAID' THEN RETURN 'PAYMENT_REQUIRED'; END IF;

  SELECT total_seats, filled_seats INTO v_total, v_filled
  FROM seats WHERE program_id = v_program FOR UPDATE;

  IF v_filled >= v_total THEN
    UPDATE applications SET status = 'REJECTED' WHERE application_id = p_application_id;
    INSERT INTO admissions(application_id, decision, seat_allotted, decided_by)
    VALUES (p_application_id, 'REJECTED', FALSE, p_admin);
    RETURN 'NO_SEATS_LEFT';
  END IF;

  UPDATE seats SET filled_seats = filled_seats + 1 WHERE program_id = v_program;
  UPDATE applications SET status = 'ADMITTED' WHERE application_id = p_application_id;
  INSERT INTO admissions(application_id, decision, seat_allotted, decided_by)
  VALUES (p_application_id, 'ADMITTED', TRUE, p_admin);
  RETURN 'SEAT_ALLOCATED';
END $$ LANGUAGE plpgsql;

-- Enrollment: generates an enrollment number and links the student to the program
CREATE OR REPLACE FUNCTION enroll_student(p_application_id INT) RETURNS TEXT AS $$
DECLARE v_student INT; v_program INT; v_status VARCHAR; v_no TEXT;
BEGIN
  SELECT student_id, program_id, status INTO v_student, v_program, v_status
  FROM applications WHERE application_id = p_application_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'ADMITTED' THEN RETURN 'NOT_ADMITTED'; END IF;
  v_no := 'EF' || to_char(now(),'YY') || lpad(v_student::text, 5, '0');
  UPDATE students SET enrollment_no = v_no, program_id = v_program WHERE student_id = v_student;
  UPDATE applications SET status = 'ENROLLED' WHERE application_id = p_application_id;
  UPDATE users SET role_id = (SELECT role_id FROM roles WHERE role_name = 'STUDENT')
   WHERE user_id = (SELECT user_id FROM students WHERE student_id = v_student);
  RETURN v_no;
END $$ LANGUAGE plpgsql;
