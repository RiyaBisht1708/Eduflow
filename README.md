# EduFlow – Admission Management & Student ERP

B.Tech CSE, 5th semester project (DBMS + Operating Systems).

```
Registration → Lead → Counselling → Application → Document Verification → Eligibility
→ Payment → Admission Decision → Seat Allocation → Enrollment → Student ERP
```

| Folder | What it is | Tech |
|---|---|---|
| `database/` | Baseline schema and incremental ERP migration, seed data, views, triggers, stored functions, demo queries | PostgreSQL |
| `os-engine/` | CPU scheduler (Priority, FCFS, Round Robin) and synchronization demos | C++17 |
| `backend/` | REST API with JWT authentication | Java 25, Spring Boot 3 |
| `frontend/` | Applicant portal, admin dashboard, scheduler visualiser | React 18, Vite |

## Run it

You need PostgreSQL, JDK 25+, Maven, Node 18+ and g++.

```bash
# 1. Database
psql -U postgres -c "CREATE DATABASE eduflow;"
psql -U postgres -d eduflow -f database/schema.sql -f database/seed.sql
psql -U postgres -d eduflow -f database/migrations/001_student_erp.sql

# 2. OS engine (must be built before the backend can run the scheduler)
cd os-engine && make && cd ..

# 3. Backend  (http://localhost:8080)
cd backend
export DB_PASSWORD=your_postgres_password      # defaults: user=postgres, password=postgres
mvn spring-boot:run

# 4. Frontend  (http://localhost:5173)
cd frontend && npm install && npm run dev
```

For an existing EduFlow database, apply only the additive ERP migration; do not rerun `schema.sql` because it recreates the `public` schema.

Seeded demo accounts use password `password123`:
`admin@eduflow.edu` (admin), `riya@eduflow.edu` (counsellor), and `aarav@mail.com`, `diya@mail.com`, `kabir@mail.com` (applicants; enrolled applicants become students).

### Try the full workflow
1. Sign in as `aarav@mail.com`, apply to **B.Tech CSE** (e.g. 10th 92, 12th 88, entrance 142), upload the three required documents.
2. Sign in as `admin@eduflow.edu` → **Applications**: Verify documents → Check eligibility.
3. Back as the applicant: pay the admission fee.
4. As admin: Allocate seat → Enroll student. The applicant now sees the student page.
5. B.Tech CSE has only **2 seats**, so a third paid applicant is rejected: the seat-allocation concurrency example.

## DBMS component (`database/`)
- ER design → 22 tables in 3NF with PKs, FKs, `CHECK`, `UNIQUE`, `NOT NULL` constraints.
- **Indexes** on status, program, payments and notifications.
- **Triggers**: status-history logging and applicant notification on every status change.
- **Views**: `v_admission_stats`, `v_application_detail`, `v_attendance_summary`, plus ERP attendance, published-performance, and fee summaries (joins, aggregation, `FILTER`).
- **Transactions / concurrency**: `allocate_seat()` locks the application and seat rows with `SELECT … FOR UPDATE`; the `seats_not_overbooked` CHECK constraint is a second safety net. `queries.sql` has a two-session demo.
- **Student ERP migration** (`database/migrations/001_student_erp.sql`): adds student semester and exam publication state, academic integrity triggers, attendance/result/exam audit logging, indexes, attendance/performance/fee summary views, grade calculation, and weighted SGPA/CGPA functions. It is additive and safe to rerun.
- `database/queries.sql` includes read-only ERP examples using joins, aggregates, `HAVING`, and a subquery.

## Student ERP
- The student dashboard reads the signed-in student's profile, department, programme, semester, per-course attendance, upcoming exams, published marks/grades, fee schedule, actual payment history, notifications, and calculated SGPA/CGPA when published results exist.
- Attendance is admin-managed by course and date. The database enforces student/course programme consistency, and the existing `(student, course, date)` uniqueness prevents duplicates.
- Admins can create examinations, enter marks up to the configured maximum, publish/unpublish results, search enrolled students, view student profiles, and manage programme/semester details.
- Admin dashboard statistics (applicants, enrollment, programmes, applications, successful fee payments, attendance, status distribution, and recent applications) are database-backed.
- Faculty is not enabled: the existing schema and authentication model have no faculty table or role, so this sprint keeps academic write access admin-only instead of adding an incomplete role.

## OS component (`os-engine/`)
```bash
make
./scheduler all 2 < sample_jobs.txt     # Priority, FCFS, Round Robin (quantum 2) with Gantt chart
./sync_demo all                         # race condition, producer-consumer, deadlock, fork/wait
```
- Metrics: completion, turnaround, waiting, response time, averages, Gantt chart.
- **Priority** (primary, non-preemptive, lower number = more urgent, FCFS tie-break), **FCFS**, **Round Robin**.
- `sync_demo race`: 20 threads fight for 5 seats, once without a mutex (overbooks) and once with one (correct).
- `sync_demo prodcons`: bounded buffer with mutex + condition variables.
- `sync_demo deadlock`: circular wait detected with timed locks, then fixed with lock ordering.
- `sync_demo process`: one child process per job using `fork()`/`wait()`.
- The backend runs `scheduler` as a child process (`SchedulerService`) and the React page draws the Gantt charts.

## REST API summary
| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register`, `/login`; `GET /api/auth/me` | public / any | JWT auth |
| `GET /api/programs`, `POST /api/leads` | public | catalogue, enquiry form |
| `GET/POST /api/applications/mine`, `/applications` | applicant | apply, track |
| `GET/POST /api/applications/{id}/documents`, `GET …/history`, `POST …/pay` | applicant | documents, history, payment |
| `GET /api/admin/applications?status=` | admin | application manager |
| `POST /api/admin/applications/{id}/verify-documents` · `check-eligibility` · `allocate-seat` · `enroll` | admin | workflow steps |
| `GET /api/admin/stats` | admin | dashboard |
| `GET/PATCH/POST /api/leads…` | admin, counsellor | leads and follow-ups |
| `GET/POST /api/admin/scheduler/jobs`, `POST …/run` | admin | OS engine |
| `GET /api/erp/profile|attendance|results|exams|fees` | student | student ERP data |
| `GET /api/admin/students?q=&programId=`; `GET /api/admin/students/{id}` | admin | student search and profile |
| `PUT /api/admin/students/{id}/academic` | admin | programme and semester |
| `GET /api/admin/erp/courses`, `GET /api/admin/erp/roster?courseId=&date=` | admin | attendance roster |
| `POST /api/admin/erp/attendance` | admin | mark/update daily attendance |
| `GET/POST /api/admin/erp/exams`, `GET /api/admin/erp/exams/{id}/roster` | admin | exams and marks roster |
| `POST /api/admin/erp/results`, `PUT /api/admin/erp/exams/{id}/publication` | admin | marks and result visibility |

See [DEMO_GUIDE.md](./DEMO_GUIDE.md) for a step-by-step evaluation flow and SQL demonstrations.

## Scope notes
- Payments are simulated; there is no real gateway (out of scope per the report).
- Document upload stores file metadata only; binary storage is a natural v2 feature.
- Change `EDUFLOW_JWT_SECRET` and the DB password for anything beyond a demo.
