// DesignDesk AI — front-end logic (vanilla JS, no build step).
const $ = id => document.getElementById(id);
const STEPS = [
  ['created', 'Created'],
  ['draft_ready', 'Draft ready'],
  ['awaiting_payment', 'Awaiting payment'],
  ['paid', 'Paid'],
  ['delivered', 'Delivered'],
];

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function money(n) { return '$' + Number(n).toFixed(2); }

function quoteHtml(q) {
  const rows = q.lines.map(l => `<tr><td>${l.label}</td><td>${money(l.amount)}</td></tr>`).join('');
  return `<table>${rows}<tr class="total"><td>Total (USD)</td><td>${money(q.total)}</td></tr></table>`;
}

async function refreshQuote() {
  const type = $('type').value, style = $('style').value, description = $('description').value;
  if (!description.trim()) { $('quotePreview').classList.add('hidden'); return; }
  try {
    const q = await api('/api/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, style, description }),
    });
    $('quotePreview').innerHTML = '<strong>Live quote</strong>' + quoteHtml(q);
    $('quotePreview').classList.remove('hidden');
  } catch { /* keep preview hidden while typing invalid input */ }
}

let quoteTimer;
for (const id of ['type', 'style', 'description']) {
  document.addEventListener('input', e => {
    if (e.target.id === id) { clearTimeout(quoteTimer); quoteTimer = setTimeout(refreshQuote, 350); }
  });
}

$('briefForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    type: $('type').value, style: $('style').value,
    description: $('description').value, email: $('email').value,
  };
  try {
    const order = await api('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const mine = JSON.parse(localStorage.getItem('dd-orders') || '[]');
    if (!mine.includes(order.id)) { mine.push(order.id); localStorage.setItem('dd-orders', JSON.stringify(mine)); }
    renderMine();
    showOrder(order);
  } catch (err) { alert(err.message); }
});

function renderMine() {
  const mine = JSON.parse(localStorage.getItem('dd-orders') || '[]');
  $('myOrders').innerHTML = mine.length
    ? '<p>Your orders: ' + mine.map(id => `<span class="chip" onclick="track('${id}')">${id}</span>`).join('') + '</p>'
    : '';
}

async function track(id) {
  try { showOrder(await api('/api/orders/' + encodeURIComponent(id))); }
  catch (err) { alert(err.message); }
}
window.track = track;
$('trackBtn').addEventListener('click', () => track($('trackId').value.trim().toUpperCase()));

function showOrder(o) {
  location.hash = 'order/' + o.id;
  const idx = STEPS.findIndex(s => s[0] === o.status);
  const timeline = STEPS.map((s, i) =>
    `<div class="step ${i <= idx ? 'done' : ''}">${s[1]}</div>`).join('');

  let actions = '';
  if (o.status === 'draft_ready') {
    actions = `<button class="primary" onclick="approve('${o.id}')">✓ Approve draft &amp; continue to payment</button>`;
  } else if (o.status === 'awaiting_payment') {
    actions = o.paymentMode === 'demo'
      ? `<div class="demo-note">🧪 <strong>SANDBOX DEMO MODE</strong> — no PayPal credentials are configured on this
           server, so this checkout is simulated. Add sandbox credentials (see README) to pay with a real
           PayPal sandbox account.</div>
         <button class="paypal" onclick="demoPay('${o.id}')">Pay ${money(o.quote.total)} — simulated PayPal checkout</button>`
      : `<button class="paypal" onclick="realPay('${o.id}')">Pay ${money(o.quote.total)} with PayPal (sandbox)</button>`;
  } else if (o.status === 'paid') {
    actions = `<button class="primary" onclick="deliver('${o.id}')">📦 Deliver final design (studio action)</button>`;
  } else if (o.status === 'delivered') {
    actions = `<a class="download" href="/api/orders/${o.id}/download">⬇ Download final design</a>`;
  }

  $('orderPanel').innerHTML = `
    <h2>Order ${o.id} — ${o.typeLabel} (${o.style})</h2>
    <p style="color:#43536e">${o.description}</p>
    <div class="timeline">${timeline}</div>
    <div class="quote">${quoteHtml(o.quote)}</div>
    ${o.draftFile ? `<h3>AI draft concept ${o.draftMode === 'demo' ? '<span class="badge demo">DEMO MODE</span>' : ''}</h3>
      <img class="draft-img" src="/api/orders/${o.id}/draft" alt="AI draft">` : ''}
    <div class="actions">${actions}</div>`;
  $('orderPanel').classList.remove('hidden');
  $('orderPanel').scrollIntoView({ behavior: 'smooth' });
}

async function act(id, path) {
  try { showOrder(await api(`/api/orders/${id}${path}`, { method: 'POST' })); }
  catch (err) { alert(err.message); }
}
window.approve = id => act(id, '/approve');
window.deliver = id => act(id, '/deliver');
window.demoPay = async id => {
  try {
    showOrder(await api(`/api/orders/${id}/pay/demo-confirm`, { method: 'POST' }));
  } catch (err) { alert(err.message); }
};
window.realPay = async id => {
  try {
    const r = await api(`/api/orders/${id}/pay`, { method: 'POST' });
    if (r.approveUrl) location.href = r.approveUrl; else alert('No approval URL returned');
  } catch (err) { alert(err.message); }
};

(async function init() {
  const cfg = await api('/api/config');
  $('type').innerHTML = cfg.types.map(t =>
    `<option value="${t.value}">${t.label} — from $${t.base}</option>`).join('');
  $('modeBadges').innerHTML =
    (cfg.paymentMode === 'demo' ? '<span class="badge demo">PAYMENT: DEMO</span>' : '<span class="badge live">PAYPAL SANDBOX</span>') +
    (cfg.imageMode === 'demo' ? '<span class="badge demo">IMAGE: DEMO</span>' : '<span class="badge live">AI IMAGE API</span>');
  renderMine();
  const m = location.hash.match(/order\/([A-Z0-9-]+)/i);
  if (m) track(m[1].toUpperCase());
})();
