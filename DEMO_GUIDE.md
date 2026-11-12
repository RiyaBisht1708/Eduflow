# EduFlow Evaluation Demo

## Start the application

Requirements: PostgreSQL, JDK 25+, Maven, Node 18+, and g++.

For a fresh local database:

```bash
psql -U postgres -c "CREATE DATABASE eduflow;"
psql -U postgres -d eduflow -f database/schema.sql -f database/seed.sql
psql -U postgres -d eduflow -f database/migrations/001_student_erp.sql
```

For an existing database, run only the migration:

```bash
psql -U postgres -d eduflow -f database/migrations/001_student_erp.sql
```

Do not rerun `database/schema.sql` against an existing database; it drops and recreates the `public` schema.

Start the services in separate terminals:

```bash
cd os-engine && make
```

```bash
cd backend
export DB_USER=postgres
export DB_PASSWORD=your_postgres_password
mvn spring-boot:run
```

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The backend listens on port 8080.

## Demo credentials

Seeded account password: `password123`.

| Account | Role | Notes |
|---|---|---|
| `admin@eduflow.edu` | Admin | Admissions and ERP management |
| `riya@eduflow.edu` | Counsellor | Leads |
| `aarav@mail.com` | Applicant / Student | Becomes a student after enrollment |
| `diya@mail.com` | Applicant / Student | Becomes a student after enrollment |
| `kabir@mail.com` | Applicant / Student | Becomes a student after enrollment |

An applicant's role refreshes from the server at login and `/api/auth/me`; an already-issued applicant token does not have to be trusted after enrollment.

## Suggested walkthrough

1. Sign in as `aarav@mail.com`, submit an application to an available programme, and add the required tenth marksheet, twelfth marksheet, and ID proof metadata.
2. Sign in as admin. In **Admissions**, verify the documents, check eligibility, allocate a seat after payment, and enroll the admitted applicant.
3. Sign back in as the now-enrolled student. The dashboard reads the student's enrollment number, programme, department, semester, attendance, upcoming exams, published results, fee schedule/payment history, and notifications from the API.
4. As admin, open **Students** to search and filter enrolled students, inspect a profile, and update the programme/semester. Programme changes are blocked after academic records exist.
5. In **Attendance**, choose a course and class date, mark students present/absent, and save. Saving again for the same student/course/date updates the existing row.
6. In **Exams & results**, create an examination for a course, enter marks for enrolled students, and publish the result. Marks above the maximum are rejected. The student dashboard shows results only when published.
7. Review **Fees** on the student dashboard. The existing admission payment remains simulated; only actual rows in `payments` are displayed as transactions.
8. Return to the admin dashboard to demonstrate live application/status, enrollment, programme, fee collection, attendance, and recent application figures.

For a stable demo, use a programme with an available seat and a student account whose enrollment is complete. The CSE seed has a deliberately small seat capacity for the existing concurrency demonstration.

## API endpoints

All endpoints below except login/program catalogue require a JWT. Admin ERP endpoints require the `ADMIN` role; student ERP endpoints use the authenticated user's own `user_id`.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Sign in and receive JWT |
| `GET` | `/api/auth/me` | Current role and enrollment number |
| `GET` | `/api/erp/profile` | Student profile, programme, semester, SGPA and CGPA |
| `GET` | `/api/erp/attendance` | Current-semester subject attendance |
| `GET` | `/api/erp/exams` | Upcoming examinations for the student's programme |
| `GET` | `/api/erp/results` | Published result rows only |
| `GET` | `/api/erp/fees` | Configured fees and recorded transactions for the student |
| `GET` | `/api/admin/stats` | Live admin dashboard statistics |
| `GET` | `/api/admin/students?q=&programId=` | Search/filter enrolled students |
| `GET` | `/api/admin/students/{id}` | Student profile |
| `PUT` | `/api/admin/students/{id}/academic` | Update programme and current semester |
| `GET` | `/api/admin/erp/courses` | Course catalogue for ERP actions |
| `GET` | `/api/admin/erp/roster?courseId={id}&date=YYYY-MM-DD` | Attendance roster and saved status |
| `POST` | `/api/admin/erp/attendance` | Mark/update attendance |
| `GET`, `POST` | `/api/admin/erp/exams` | List or create examinations |
| `GET` | `/api/admin/erp/exams/{id}/roster` | Marks roster for an examination |
| `POST` | `/api/admin/erp/results` | Add/update marks |
| `PUT` | `/api/admin/erp/exams/{id}/publication` | Publish/unpublish results |

## Database evaluation queries

Run these read-only queries after applying the ERP migration:

```sql
-- Attendance percentage by student and subject
SELECT enrollment_no, full_name, course_code, semester, classes, attended, attendance_pct
FROM v_student_attendance_detail
ORDER BY enrollment_no, semester, course_code;

-- Subject performance and grade-point inputs
SELECT u.full_name, s.enrollment_no, a.course_code, a.semester,
       a.marks_earned, a.marks_available, a.percentage, a.grade_point, a.credits
FROM v_student_academic_summary a
JOIN students s ON s.student_id = a.student_id
JOIN users u ON u.user_id = s.user_id
ORDER BY s.enrollment_no, a.semester, a.course_code;

-- Fee totals and successful payment aggregation
SELECT u.full_name, f.program_name, f.fee_type,
       f.fee_amount, f.paid_amount, f.outstanding_amount
FROM v_student_fee_summary f
JOIN students s ON s.student_id = f.student_id
JOIN users u ON u.user_id = s.user_id
ORDER BY u.full_name, f.application_id, f.fee_type;

-- Aggregate attendance shortage (GROUP BY and HAVING)
SELECT enrollment_no, full_name, ROUND(AVG(attendance_pct), 1) AS average_attendance
FROM v_student_attendance_detail
WHERE classes > 0
GROUP BY enrollment_no, full_name
HAVING AVG(attendance_pct) < 75;

-- Applications with payments above the average successful transaction (subquery)
SELECT a.application_id, u.full_name, SUM(pay.amount) AS successful_payments
FROM applications a
JOIN students s ON s.student_id = a.student_id
JOIN users u ON u.user_id = s.user_id
JOIN payments pay ON pay.application_id = a.application_id AND pay.status = 'SUCCESS'
GROUP BY a.application_id, u.full_name
HAVING SUM(pay.amount) > (SELECT AVG(amount) FROM payments WHERE status = 'SUCCESS');
```

## Completed in this sprint

- Database-backed student dashboard and student-owned API queries.
- Attendance capture and course/date roster with duplicate-safe upsert and programme integrity checks.
- Database audit events for attendance, marks, and exam changes, with the authenticated admin recorded as actor.
- Examination creation, bounded marks entry, publication controls, grades, and weighted SGPA/CGPA SQL functions.
- Fee schedule/outstanding totals and payment transaction history from existing rows only.
- Admin student search, profile lookup, academic semester/programme management, and live dashboard statistics.
- Incremental, rerunnable SQL migration; read-only DBMS examples are in `database/queries.sql`.
- Existing JWT roles and admission-to-enrollment function are reused; enrollment continues to set the student's programme/enrollment number and switch the account to `STUDENT` transactionally.

## Known limitations

- Faculty management and faculty-scoped permissions are not available in the existing identity/schema model. Academic write operations remain admin-only; no incomplete faculty role was added.
- Document uploads keep metadata only; no binary file storage is configured.
- The admission fee flow is simulated. There is no external payment gateway, and this work does not generate any payment records outside that existing workflow.
- Fee schedules display the configured fee types. The existing admission workflow only collects the configured admission fee.
- Courses are associated with programmes rather than an individual student-course enrollment table; course roster authorization is programme-based.
- SGPA/CGPA use the grade-point bands and course credits defined in the ERP migration and include published results only.
