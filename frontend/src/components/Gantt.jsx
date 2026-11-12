const COLORS = ['#2f5bd3', '#0e8f7b', '#b87414', '#8a4fc7', '#b83a3a', '#2b7a9e', '#6b7c2e', '#a3486f'];

/** Gantt chart for one scheduling result. `names` maps job id -> label shown in the legend. */
export default function Gantt({ gantt, names }) {
  if (!gantt || gantt.length === 0) return null;
  const end = gantt[gantt.length - 1].to;
  const start = gantt[0].from;
  const span = end - start || 1;
  const pct = (t) => ((t - start) / span) * 100;
  const colorOf = (id) => COLORS[(id - 1 + COLORS.length * 10) % COLORS.length];

  const ticks = [start, ...gantt.map((g) => g.to)];
  return (
    <div role="img" aria-label="Gantt chart of job execution order">
      <div className="gantt">
        {gantt.map((g, i) => (
          <div
            key={i}
            className={'seg' + (g.job < 0 ? ' idle' : '')}
            style={{ width: `${((g.to - g.from) / span) * 100}%`, background: g.job < 0 ? undefined : colorOf(g.job) }}
            title={g.job < 0 ? `Idle ${g.from}–${g.to}` : `${names[g.job] || 'J' + g.job}: ${g.from}–${g.to}`}
          >
            {g.job < 0 ? 'idle' : 'J' + g.job}
          </div>
        ))}
      </div>
      <div className="gantt-ticks">
        {ticks.map((t, i) => (
          <span key={i} style={{ left: `${pct(t)}%` }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
