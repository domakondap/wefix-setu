// Maps an order/shipment status to a colored badge.
const COLOR = {
  Created: 'blue',
  'Pickup Scheduled': 'blue',
  'Picked Up': 'blue',
  'In Transit to Shop': 'blue',
  'Received by Shop': 'blue',
  'Quote Sent': 'amber',
  'Quote Accepted': 'green',
  'In Repair': 'amber',
  Repaired: 'green',
  'Ready to Ship': 'blue',
  'Shipped Back': 'blue',
  Delivered: 'green',
  Cancelled: 'red',
  // shipment statuses
  'Label Created': 'blue',
  Scheduled: 'blue',
  'In Transit': 'amber',
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${COLOR[status] || ''}`}>{status}</span>;
}
