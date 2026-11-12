const BASE = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // An expired or invalid token: clear the session and return to login.
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.assign('/login');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

export const STATUS_TEXT = {
  SUBMITTED: 'Application received',
  DOCS_PENDING: 'Documents under review',
  DOCS_VERIFIED: 'Documents verified',
  ELIGIBLE: 'Eligible',
  NOT_ELIGIBLE: 'Not eligible',
  PAYMENT_PENDING: 'Payment due',
  PAID: 'Paid, awaiting seat',
  ADMITTED: 'Admitted',
  REJECTED: 'Not admitted',
  ENROLLED: 'Enrolled',
};

export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
