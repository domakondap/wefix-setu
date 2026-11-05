import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import CostBreakdown from '../components/CostBreakdown.jsx';

const SLOTS = ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00'];

export default function NewOrder() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ categories: [], handlingFee: 0 });
  const [shops, setShops] = useState([]);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    category: '',
    issueDescription: '',
    imageUrls: '',
    pickupCountry: 'Germany',
    pickupCity: '',
    pickupAddress: '',
    phoneCountryCode: '+49',
    phone: '',
    pickupDate: '',
    pickupSlot: '',
    shopId: '',
    pickupPartnerId: '',
    returnPartnerId: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Load catalog metadata + partners up front; shops load/filter by city.
  useEffect(() => {
    api('/catalog/meta').then(setMeta).catch((e) => setError(e.message));
    api('/catalog/partners').then((d) => setPartners(d.partners)).catch(() => {});
    api('/catalog/shops').then((d) => setShops(d.shops)).catch(() => {});
  }, []);

  const pickupPrice = useMemo(
    () => partners.find((p) => String(p.id) === form.pickupPartnerId)?.price ?? 0,
    [partners, form.pickupPartnerId]
  );
  const returnPrice = useMemo(
    () => partners.find((p) => String(p.id) === form.returnPartnerId)?.price ?? 0,
    [partners, form.returnPartnerId]
  );

  // Cost preview (repair is unknown until the vendor quotes, so it shows as pending).
  const previewCosts = {
    repair: null,
    pickup: pickupPrice,
    return: returnPrice,
    handlingFee: meta.handlingFee,
    total: pickupPrice + returnPrice + meta.handlingFee,
  };

  const filteredShops = form.pickupCity
    ? shops.filter((s) => s.city.toLowerCase() === form.pickupCity.toLowerCase())
    : shops;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        ...form,
        imageUrls: form.imageUrls
          ? form.imageUrls.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        shopId: form.shopId ? Number(form.shopId) : null,
        pickupPartnerId: form.pickupPartnerId ? Number(form.pickupPartnerId) : null,
        returnPartnerId: form.returnPartnerId ? Number(form.returnPartnerId) : null,
      };
      const { order } = await api('/orders', { method: 'POST', body: payload });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Book a repair</h1>
      <p className="muted small">
        Tell us what's broken and how to collect it. You'll get a quote before any
        repair starts.
      </p>
      {error && <div className="alert error">{error}</div>}

      <form onSubmit={onSubmit} className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Device &amp; issue</h3>
          <label>Category</label>
          <select value={form.category} onChange={set('category')} required>
            <option value="">Select a category…</option>
            {meta.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label>Describe the issue</label>
          <textarea
            value={form.issueDescription}
            onChange={set('issueDescription')}
            placeholder="e.g. Cracked screen, touch works intermittently"
            required
          />
          <label>Image URLs (optional, comma-separated)</label>
          <input
            value={form.imageUrls}
            onChange={set('imageUrls')}
            placeholder="https://…/photo1.jpg, https://…/photo2.jpg"
          />

          <h3 style={{ marginTop: 18 }}>Pickup location</h3>
          <div className="row">
            <div>
              <label>Country</label>
              <input value={form.pickupCountry} onChange={set('pickupCountry')} required />
            </div>
            <div>
              <label>City / nearest city</label>
              <input
                value={form.pickupCity}
                onChange={set('pickupCity')}
                placeholder="Berlin"
                required
              />
            </div>
          </div>
          <label>Address</label>
          <input
            value={form.pickupAddress}
            onChange={set('pickupAddress')}
            placeholder="House, street, village/town, postcode"
            required
          />
          <div className="row">
            <div style={{ maxWidth: 110 }}>
              <label>Code</label>
              <input value={form.phoneCountryCode} onChange={set('phoneCountryCode')} />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Pickup date</label>
              <input type="date" value={form.pickupDate} onChange={set('pickupDate')} />
            </div>
            <div>
              <label>Time slot</label>
              <select value={form.pickupSlot} onChange={set('pickupSlot')}>
                <option value="">Any</option>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Shop &amp; couriers</h3>
            <label>Repair shop</label>
            <select value={form.shopId} onChange={set('shopId')}>
              <option value="">
                {filteredShops.length ? 'Select a shop…' : 'No approved shops in this city'}
              </option>
              {filteredShops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.city}
                </option>
              ))}
            </select>

            <label>Pickup courier</label>
            <select value={form.pickupPartnerId} onChange={set('pickupPartnerId')}>
              <option value="">Select…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — €{p.price.toFixed(2)} · ~{p.etaDays}d
                </option>
              ))}
            </select>

            <label>Return courier</label>
            <select value={form.returnPartnerId} onChange={set('returnPartnerId')}>
              <option value="">Select…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — €{p.price.toFixed(2)} · ~{p.etaDays}d
                </option>
              ))}
            </select>
          </div>

          <div className="card">
            <h3>Cost preview</h3>
            <CostBreakdown costs={previewCosts} />
            <p className="small muted" style={{ marginTop: 10 }}>
              Repair cost is confirmed when the shop sends a quote. You can accept or
              reject it before any work begins.
            </p>
            <div className="btn-row">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create order'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
