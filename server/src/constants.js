// Order status flow — the canonical happy path plus the Cancelled terminal state.
export const ORDER_STATUSES = [
  'Created',
  'Pickup Scheduled',
  'Picked Up',
  'In Transit to Shop',
  'Received by Shop',
  'Quote Sent',
  'Quote Accepted',
  'In Repair',
  'Repaired',
  'Ready to Ship',
  'Shipped Back',
  'Delivered',
  'Cancelled',
];

// Allowed forward transitions. Admins may override these via a dedicated endpoint.
export const ORDER_TRANSITIONS = {
  Created: ['Pickup Scheduled', 'Cancelled'],
  'Pickup Scheduled': ['Picked Up', 'Cancelled'],
  'Picked Up': ['In Transit to Shop', 'Cancelled'],
  'In Transit to Shop': ['Received by Shop', 'Cancelled'],
  'Received by Shop': ['Quote Sent', 'Cancelled'],
  'Quote Sent': ['Quote Accepted', 'Cancelled'],
  'Quote Accepted': ['In Repair', 'Cancelled'],
  'In Repair': ['Repaired', 'Cancelled'],
  Repaired: ['Ready to Ship', 'Cancelled'],
  'Ready to Ship': ['Shipped Back', 'Cancelled'],
  'Shipped Back': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

export const SHIPMENT_STATUSES = [
  'Label Created',
  'Scheduled',
  'Picked Up',
  'In Transit',
  'Delivered',
];

// Maps a shipment status to the milestone timestamp column it should stamp.
export const SHIPMENT_MILESTONE_COLUMN = {
  Scheduled: 'scheduled_at',
  'Picked Up': 'picked_up_at',
  'In Transit': 'in_transit_at',
  Delivered: 'delivered_at',
};

export const ROLES = ['customer', 'vendor', 'admin'];

export const REPAIR_CATEGORIES = [
  'Mobile Phone',
  'Laptop',
  'Tablet',
  'Home Appliance',
  'Watch',
  'Camera',
  'Audio Equipment',
  'Other',
];

export const PAYMENT_METHODS = ['Card', 'Net Banking', 'PayPal'];

export const SHOP_STATUSES = ['pending', 'approved', 'disabled'];
