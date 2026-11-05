// Horizontal progress stepper that maps the 13 order statuses onto 7 visual
// stages. The connector fills to the current stage; completed stages show a
// check, the active stage pulses, future stages are dimmed.

const STAGES = [
  { key: 'booked', label: 'Booked', statuses: ['Created'] },
  { key: 'pickup', label: 'Pickup', statuses: ['Pickup Scheduled', 'Picked Up'] },
  { key: 'atshop', label: 'At Shop', statuses: ['In Transit to Shop', 'Received by Shop'] },
  { key: 'quote', label: 'Quote', statuses: ['Quote Sent', 'Quote Accepted'] },
  { key: 'repair', label: 'Repair', statuses: ['In Repair', 'Repaired'] },
  { key: 'return', label: 'Return', statuses: ['Ready to Ship', 'Shipped Back'] },
  { key: 'done', label: 'Delivered', statuses: ['Delivered'] },
];

const ICONS = {
  booked: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  pickup: 'M3 9l1-5h12l1 5M3 9h14M3 9v8a1 1 0 001 1h1m12-9v8a1 1 0 01-1 1h-1m-9 0a2 2 0 104 0m-4 0H9m4 0a2 2 0 104 0m-4 0h-1',
  atshop: 'M3 21h18M3 7v14m18-14v14M3 7l9-4 9 4M9 21v-6h6v6',
  quote: 'M9 7h6m-6 4h6m-6 4h4m-9 5h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z',
  repair: 'M11 4a4 4 0 014 4 4 4 0 01-.54 2L20 15.5 17.5 18l-5.5-5.5A4 4 0 017 8a4 4 0 016-3.46',
  return: 'M3 9l9-5 9 5v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm6 12V12h6v9',
  done: 'M5 13l4 4L19 7',
};

const ALL_ORDER = STAGES.flatMap((s) => s.statuses);

export default function OrderProgress({ status }) {
  const cancelled = status === 'Cancelled';
  let current = STAGES.findIndex((s) => s.statuses.includes(status));
  if (current === -1 && !cancelled) current = 0;

  if (cancelled) {
    return (
      <div className="progress-cancelled">
        <span className="badge red">Cancelled</span>
        <span className="muted small">This order was cancelled and is no longer in progress.</span>
      </div>
    );
  }

  const pct = STAGES.length > 1 ? (current / (STAGES.length - 1)) * 100 : 0;

  return (
    <div className="stepper" role="list" aria-label="Order progress">
      <div className="stepper-track">
        <div className="stepper-fill" style={{ width: `${pct}%` }} />
      </div>
      {STAGES.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <div key={s.key} className={`step ${state}`} role="listitem">
            <div className="step-dot">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={state === 'done' ? ICONS.done : ICONS[s.key]} />
              </svg>
            </div>
            <span className="step-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ALL_ORDER };
