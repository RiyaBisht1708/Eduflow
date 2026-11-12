import { useState } from 'react';
import { api } from '../api.js';
import Gantt from '../components/Gantt.jsx';

const SAMPLE = [
  { name: 'DOC_VERIFY', arrival: 0, burst: 6, priority: 3 },
  { name: 'ELIGIBILITY', arrival: 1, burst: 4, priority: 1 },
  { name: 'PAYMENT_VERIFY', arrival: 2, burst: 5, priority: 2 },
  { name: 'STATUS_UPDATE', arrival: 3, burst: 2, priority: 5 },
  { name: 'NOTIFY', arrival: 4, burst: 3, priority: 4 },
];
const TYPES = ['DOC_VERIFY', 'ELIGIBILITY', 'PAYMENT_VERIFY', 'STATUS_UPDATE', 'NOTIFY'];

export default function Scheduler() {
  const [jobs, setJobs] = useState(SAMPLE);
  const [quantum, setQuantum] = useState(2);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const edit = (i, k, v) => setJobs(jobs.map((j, x) => (x === i ? { ...j, [k]: k === 'name' ? v : Number(v) } : j)));
  const add = () => setJobs([...jobs, { name: 'NOTIFY', arrival: 0, burst: 1, priority: 5 }]);
  const remove = (i) => setJobs(jobs.filter((_, x) => x !== i));

  async function loadQueue() {
    setErr('');
    try {
      const q = await api('/admin/scheduler/jobs');
      if (q.length === 0) return setErr('The job queue in the database is empty.');
      setJobs(q.map((j) => ({ name: j.job_type, arrival: j.arrival_time, burst: j.burst_time, priority: j.priority })));
      setRes(null);
    } catch (e) { setErr(e.message); }
  }

  async function run() {
    setBusy(true); setErr('');
    try { setRes(await api('/admin/scheduler/run', { method: 'POST', body: { algorithm: 'all', quantum, jobs } })); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const names = Object.fromEntries(jobs.map((j, i) => [i + 1, j.name]));
  const bestWT = res ? Math.min(...res.results.map((r) => r.avgWaiting)) : 0;
  const bestTAT = res ? Math.min(...res.results.map((r) => r.avgTurnaround)) : 0;

  return (
    <section className="page">
      <div className="page-head"><div><h1 style={{ fontSize: '2rem' }}>Admission job scheduler</h1>
        <p className="muted">Document checks, eligibility, payment checks and notifications run as jobs in the C++ engine. Priority 1 is the most urgent.</p></div></div>
      {err && <div className="notice error" role="alert">{err}</div>}

      <div className="panel">
        <h2>Jobs</h2>
        <div className="table-wrap">
          <table className="jobs-edit">
            <thead><tr><th>Job</th><th>Type</th><th className="num">Arrival</th><th className="num">Burst time</th><th className="num">Priority</th><th></th></tr></thead>
            <tbody>
              {jobs.map((j, i) => (
                <tr key={i}>
                  <td>J{i + 1}</td>
                  <td><select aria-label={`Type of job ${i + 1}`} value={j.name} onChange={(e) => edit(i, 'name', e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td><input aria-label={`Arrival of job ${i + 1}`} type="number" min="0" value={j.arrival} onChange={(e) => edit(i, 'arrival', e.target.value)} /></td>
                  <td><input aria-label={`Burst time of job ${i + 1}`} type="number" min="1" value={j.burst} onChange={(e) => edit(i, 'burst', e.target.value)} /></td>
                  <td><input aria-label={`Priority of job ${i + 1}`} type="number" min="1" max="10" value={j.priority} onChange={(e) => edit(i, 'priority', e.target.value)} /></td>
                  <td><button className="danger" onClick={() => remove(i)} aria-label={`Remove job ${i + 1}`}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field-row" style={{ alignItems: 'end', marginTop: '1rem' }}>
          <div className="field" style={{ marginBottom: 0 }}><label htmlFor="q">Round Robin time quantum</label><input id="q" type="number" min="1" value={quantum} onChange={(e) => setQuantum(Math.max(1, Number(e.target.value)))} /></div>
          <div style={{ gridColumn: 'span 2' }}>
            <button className="primary" onClick={run} disabled={busy || jobs.length === 0}>{busy ? 'Running…' : 'Run all three algorithms'}</button>{' '}
            <button className="ghost" onClick={add}>Add job</button>{' '}
            <button className="ghost" onClick={loadQueue}>Load queue from database</button>
          </div>
        </div>
      </div>

      {res && (
        <>
          <div className="panel table-wrap">
            <h2>Comparison</h2>
            <table>
              <thead><tr><th>Algorithm</th><th className="num">Avg waiting time</th><th className="num">Avg turnaround time</th><th className="num">Avg response time</th></tr></thead>
              <tbody>
                {res.results.map((r) => (
                  <tr key={r.algorithm}>
                    <td><b>{r.algorithm}</b></td>
                    <td className={'num' + (r.avgWaiting === bestWT ? ' best' : '')}>{r.avgWaiting.toFixed(2)}</td>
                    <td className={'num' + (r.avgTurnaround === bestTAT ? ' best' : '')}>{r.avgTurnaround.toFixed(2)}</td>
                    <td className="num">{r.avgResponse.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Green underline marks the lowest average. Priority scheduling is the engine's primary algorithm; FCFS and Round Robin are for comparison.</p>
          </div>

          <div className="panel">
            {res.results.map((r) => (
              <div className="algo-block" key={r.algorithm}>
                <h3>{r.algorithm}</h3>
                <Gantt gantt={r.gantt} names={names} />
                <div className="table-wrap" style={{ marginTop: '.5rem' }}>
                  <table>
                    <thead><tr><th>Job</th><th>Type</th><th className="num">Arrival</th><th className="num">Burst</th><th className="num">Priority</th><th className="num">Completion</th><th className="num">Turnaround</th><th className="num">Waiting</th><th className="num">Response</th></tr></thead>
                    <tbody>
                      {r.jobs.map((j) => (
                        <tr key={j.id}><td>J{j.id}</td><td>{j.name}</td><td className="num">{j.arrival}</td><td className="num">{j.burst}</td><td className="num">{j.priority}</td>
                          <td className="num">{j.completion}</td><td className="num">{j.turnaround}</td><td className="num">{j.waiting}</td><td className="num">{j.response}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
