import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const homeFor = (role) =>
  ({ ADMIN: '/admin', COUNSELLOR: '/leads', STUDENT: '/student', APPLICANT: '/portal' }[role] || '/');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [ready, setReady] = useState(!localStorage.getItem('token'));

  // Refresh the role from the server: a token issued before enrolment still says APPLICANT.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api('/auth/me')
      .then((me) => {
        if (me.token) localStorage.setItem('token', me.token);
        const u = { ...JSON.parse(localStorage.getItem('user') || '{}'), name: me.full_name, role: me.role, enrollmentNo: me.enrollment_no };
        localStorage.setItem('user', JSON.stringify(u));
        setUser(u);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const login = (data) => {
    localStorage.setItem('token', data.token);
    const u = { name: data.name, email: data.email, role: data.role };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, login, logout, ready }}>{children}</AuthCtx.Provider>;
}
