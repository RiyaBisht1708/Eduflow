import { Navigate, NavLink, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Portal from './pages/Portal.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Applications from './pages/Applications.jsx';
import Leads from './pages/Leads.jsx';
import Scheduler from './pages/Scheduler.jsx';
import Student from './pages/Student.jsx';
import Attendance from './pages/Attendance.jsx';
import Exams from './pages/Exams.jsx';
import Students from './pages/Students.jsx';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="page muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const links = {
    APPLICANT: [['/portal', 'My applications']],
    STUDENT: [['/student', 'My studies'], ['/portal', 'Admission']],
    COUNSELLOR: [['/leads', 'Leads']],
    ADMIN: [
      ['/admin', 'Dashboard'],
      ['/admin/applications', 'Admissions'],
      ['/admin/students', 'Students'],
      ['/admin/attendance', 'Attendance'],
      ['/admin/exams', 'Exams & results'],
      ['/leads', 'Leads'],
      ['/admin/scheduler', 'OS scheduler'],
    ],
  }[user?.role] || [];

  if (user) {
    return (
      <aside className="sidebar">
        <Link to={homeFor(user.role)} className="brand">EduFlow<span>UNIVERSITY ERP</span></Link>
        <nav aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{user.name}</span>
          <button className="ghost" onClick={() => { logout(); nav('/'); }}>Sign out</button>
        </div>
      </aside>
    );
  }

  return (
    <header className="topbar">
      <Link to="/" className="brand">EduFlow</Link>
      <div className="who">
        <Link className="btn small" to="/login">Sign in</Link>
      </div>
    </header>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className={user ? 'app-layout' : ''}>
      <Header />
      <main className={user ? 'app-main' : ''}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<Guard roles={['APPLICANT', 'STUDENT']}><Portal /></Guard>} />
          <Route path="/student" element={<Guard roles={['STUDENT']}><Student /></Guard>} />
          <Route path="/leads" element={<Guard roles={['ADMIN', 'COUNSELLOR']}><Leads /></Guard>} />
          <Route path="/admin" element={<Guard roles={['ADMIN']}><Dashboard /></Guard>} />
          <Route path="/admin/applications" element={<Guard roles={['ADMIN']}><Applications /></Guard>} />
          <Route path="/admin/students" element={<Guard roles={['ADMIN']}><Students /></Guard>} />
          <Route path="/admin/attendance" element={<Guard roles={['ADMIN']}><Attendance /></Guard>} />
          <Route path="/admin/exams" element={<Guard roles={['ADMIN']}><Exams /></Guard>} />
          <Route path="/admin/scheduler" element={<Guard roles={['ADMIN']}><Scheduler /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
