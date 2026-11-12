INSERT INTO roles(role_name) VALUES ('ADMIN'),('COUNSELLOR'),('APPLICANT'),('STUDENT');

-- Password hashes are the placeholder 'RESET_ME'. On first start the Spring Boot
-- DataInitializer replaces them with BCrypt("password123") for every seeded user.
INSERT INTO users(full_name,email,phone,password_hash,role_id) VALUES
('Admin User',      'admin@eduflow.edu','9000000001','RESET_ME',1),
('Riya Counsellor', 'riya@eduflow.edu', '9000000002','RESET_ME',2),
('Aarav Sharma',    'aarav@mail.com',   '9100000001','RESET_ME',3),
('Diya Verma',      'diya@mail.com',    '9100000002','RESET_ME',3),
('Kabir Singh',     'kabir@mail.com',   '9100000003','RESET_ME',3);

INSERT INTO departments(dept_name) VALUES
('Computer Science & Engineering'),('Electronics & Communication'),('Mechanical Engineering');

INSERT INTO programs(dept_id,program_name,duration_yrs,annual_fee) VALUES
(1,'B.Tech CSE',4,150000),(2,'B.Tech ECE',4,130000),(3,'B.Tech Mechanical',4,120000);

INSERT INTO courses(program_id,course_code,course_name,semester,credits) VALUES
(1,'CS101','Programming in C',1,4),
(1,'CS301','Database Management Systems',5,4),
(1,'CS302','Operating Systems',5,4);

INSERT INTO counsellors(user_id,dept_id) VALUES (2,1);

INSERT INTO students(user_id,dob,gender,tenth_pct,twelfth_pct,entrance_score) VALUES
(3,'2008-04-12','M',92.5,88.0,142),
(4,'2008-08-30','F',95.0,91.5,160),
(5,'2008-01-05','M',70.0,58.0,80);

INSERT INTO eligibility_rules(program_id,min_twelfth_pct,min_tenth_pct,min_entrance) VALUES
(1,75,60,100),(2,70,60,90),(3,60,50,70);

-- CSE has only 2 seats on purpose, so the concurrency demo is easy to see.
INSERT INTO seats(program_id,total_seats) VALUES (1,2),(2,60),(3,60);

INSERT INTO fees(program_id,fee_type,amount) VALUES
(1,'APPLICATION',1000),(1,'ADMISSION',25000),
(2,'APPLICATION',1000),(2,'ADMISSION',22000),
(3,'APPLICATION',1000),(3,'ADMISSION',20000);

INSERT INTO leads(name,email,phone,program_id,counsellor_id,status) VALUES
('Meera Joshi','meera@mail.com','9200000001',1,1,'NEW'),
('Rohan Das',  'rohan@mail.com','9200000002',2,1,'INTERESTED');

INSERT INTO follow_ups(lead_id,counsellor_id,note,next_date) VALUES
(2,1,'Discussed ECE labs; call back Friday', CURRENT_DATE + 3);

INSERT INTO applications(student_id,program_id,priority) VALUES (1,1,3),(2,1,1),(3,1,7);

INSERT INTO scheduler_jobs(job_type,application_id,priority,burst_time,arrival_time) VALUES
('DOC_VERIFY',1,3,6,0),('ELIGIBILITY',2,1,4,1),('PAYMENT_VERIFY',1,2,5,2),
('STATUS_UPDATE',3,5,2,3),('NOTIFY',2,4,3,4);
