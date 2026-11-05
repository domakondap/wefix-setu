function fmt(ts) {
  if (!ts) return '';
  // SQLite returns "YYYY-MM-DD HH:MM:SS" (UTC). Render in the user's locale.
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function Timeline({ events = [] }) {
  if (!events.length) {
    return <p className="muted small">No timeline events yet.</p>;
  }
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <div className="t-msg">{e.message}</div>
          <div className="t-meta">
            {e.status ? `${e.status} · ` : ''}
            {e.actorRole ? `${e.actorRole} · ` : ''}
            {fmt(e.createdAt)}
          </div>
        </li>
      ))}
    </ul>
  );
}
