function money(n) {
  if (n == null) return '—';
  return `€${Number(n).toFixed(2)}`;
}

export default function CostBreakdown({ costs }) {
  if (!costs) return null;
  return (
    <div>
      <div className="cost-line">
        <span>Repair</span>
        <span>{costs.repair == null ? 'Pending quote' : money(costs.repair)}</span>
      </div>
      <div className="cost-line">
        <span>Pickup courier</span>
        <span>{money(costs.pickup)}</span>
      </div>
      <div className="cost-line">
        <span>Return courier</span>
        <span>{money(costs.return)}</span>
      </div>
      <div className="cost-line">
        <span>Platform handling fee</span>
        <span>{money(costs.handlingFee)}</span>
      </div>
      <div className="cost-line total">
        <span>Total</span>
        <span>{money(costs.total)}</span>
      </div>
    </div>
  );
}
