// Shapes DB rows into clean JSON for API responses.

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phoneCountryCode: row.phone_country_code || null,
    phone: row.phone || null,
    createdAt: row.created_at,
  };
}

export function publicShop(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    country: row.country,
    city: row.city,
    address: row.address,
    categories: safeJson(row.categories, []),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function publicPartner(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    serviceAreas: safeJson(row.service_areas, []),
    price: row.price,
    etaDays: row.eta_days,
    enabled: !!row.enabled,
    createdAt: row.created_at,
  };
}

export function publicShipment(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    partnerId: row.partner_id,
    trackingNumber: row.tracking_number,
    status: row.status,
    scheduledAt: row.scheduled_at,
    pickedUpAt: row.picked_up_at,
    inTransitAt: row.in_transit_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  };
}

export function publicEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    status: row.status,
    message: row.message,
    actorRole: row.actor_role,
    createdAt: row.created_at,
  };
}

export function publicOrder(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    customerId: row.customer_id,
    shopId: row.shop_id,
    category: row.category,
    issueDescription: row.issue_description,
    imageUrls: safeJson(row.image_urls, []),

    pickup: {
      country: row.pickup_country,
      city: row.pickup_city,
      address: row.pickup_address,
      phoneCountryCode: row.phone_country_code,
      phone: row.phone,
      date: row.pickup_date,
      slot: row.pickup_slot,
    },

    pickupPartnerId: row.pickup_partner_id,
    returnPartnerId: row.return_partner_id,

    status: row.status,

    costs: {
      repair: row.repair_cost,
      pickup: row.pickup_cost,
      return: row.return_cost,
      handlingFee: row.handling_fee,
      total: row.total_cost,
    },
    estimatedDays: row.estimated_days,
    quoteNotes: row.quote_notes,
    quoteStatus: row.quote_status,

    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,

    beforeNotes: row.before_notes,
    afterNotes: row.after_notes,
    disputeFlag: !!row.dispute_flag,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
