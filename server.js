// DesignDesk AI — single-file server (zero dependencies, Node >= 18).
// Run: npm start  →  http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const { quote, BASE_PRICES } = require('./lib/quote');
const { generateDraft } = require('./lib/draft');
const paypal = require('./lib/paypal');
const store = require('./lib/store');

// --- minimal .env loader (no dependency) ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DRAFTS = path.join(__dirname, 'data', 'drafts');
fs.mkdirSync(DRAFTS, { recursive: true });

const STATUSES = ['created', 'draft_ready', 'awaiting_payment', 'paid', 'delivered'];

function send(res, code, body, type = 'application/json') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function publicOrder(o) {
  if (!o) return null;
  return { ...o, paymentMode: paypal.configured() ? 'paypal-sandbox' : 'demo' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const p = url.pathname;
  try {
    // ---------- API ----------
    if (p === '/api/config' && req.method === 'GET') {
      return send(res, 200, {
        types: Object.entries(BASE_PRICES).map(([value, v]) => ({ value, label: v.label, base: v.base })),
        paymentMode: paypal.configured() ? 'paypal-sandbox' : 'demo',
        imageMode: process.env.IMAGE_API_KEY ? 'ai' : 'demo',
      });
    }

    if (p === '/api/quote' && req.method === 'POST') {
      const b = await readBody(req);
      if (!BASE_PRICES[b.type]) return send(res, 400, { error: 'Invalid design type' });
      return send(res, 200, quote(b.type, b.style || 'modern', b.description || ''));
    }

    if (p === '/api/orders' && req.method === 'POST') {
      const b = await readBody(req);
      if (!BASE_PRICES[b.type]) return send(res, 400, { error: 'Invalid design type' });
      if (!b.description || !b.description.trim()) return send(res, 400, { error: 'Brief description is required' });
      if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return send(res, 400, { error: 'A valid email is required' });

      const id = store.newOrderId();
      const q = quote(b.type, b.style || 'modern', b.description);
      const order = {
        id,
        type: b.type,
        typeLabel: BASE_PRICES[b.type].label,
        style: b.style || 'modern',
        description: b.description.trim(),
        email: b.email.trim(),
        quote: q,
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        draftFile: null, draftMode: null, paypalOrderId: null, paidAt: null, deliveredAt: null,
      };
      store.create(order);

      const draft = await generateDraft(order, DRAFTS);
      const updated = store.update(id, { draftFile: draft.file, draftMode: draft.mode, status: 'draft_ready' });
      return send(res, 201, publicOrder(updated));
    }

    const m = p.match(/^\/api\/orders\/([A-Z0-9-]+)(\/.*)?$/i);
    if (m) {
      const id = m[1].toUpperCase();
      const sub = m[2] || '';
      const order = store.get(id);
      if (!order) return send(res, 404, { error: 'Order not found' });

      if (sub === '' && req.method === 'GET') return send(res, 200, publicOrder(order));

      if (sub === '/draft' && req.method === 'GET') {
        if (!order.draftFile) return send(res, 404, { error: 'No draft yet' });
        const file = path.join(DRAFTS, order.draftFile);
        const type = order.draftFile.endsWith('.png') ? 'image/png' : 'image/svg+xml';
        return send(res, 200, fs.readFileSync(file), type);
      }

      if (sub === '/approve' && req.method === 'POST') {
        if (order.status !== 'draft_ready') return send(res, 409, { error: 'Draft is not awaiting approval (status: ' + order.status + ')' });
        return send(res, 200, publicOrder(store.update(id, { status: 'awaiting_payment' })));
      }

      if (sub === '/pay' && req.method === 'POST') {
        if (order.status !== 'awaiting_payment') return send(res, 409, { error: 'Order is not awaiting payment (status: ' + order.status + ')' });
        if (paypal.configured()) {
          const base = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
          const r = await paypal.createOrder(order, base);
          store.update(id, { paypalOrderId: r.paypalOrderId });
          return send(res, 200, { mode: 'paypal-sandbox', approveUrl: r.approveUrl });
        }
        return send(res, 200, { mode: 'demo', amount: order.quote.total, currency: 'USD' });
      }

      if (sub === '/pay/demo-confirm' && req.method === 'POST') {
        if (paypal.configured()) return send(res, 400, { error: 'Demo payment is disabled when PayPal credentials are configured' });
        if (order.status !== 'awaiting_payment') return send(res, 409, { error: 'Order is not awaiting payment (status: ' + order.status + ')' });
        return send(res, 200, publicOrder(store.update(id, { status: 'paid', paidAt: new Date().toISOString(), paymentRef: 'DEMO-' + id })));
      }

      if (sub === '/deliver' && req.method === 'POST') {
        if (order.status !== 'paid') return send(res, 409, { error: 'Order must be paid before delivery (status: ' + order.status + ')' });
        return send(res, 200, publicOrder(store.update(id, { status: 'delivered', deliveredAt: new Date().toISOString() })));
      }

      if (sub === '/download' && req.method === 'GET') {
        if (order.status !== 'delivered') return send(res, 409, { error: 'Final design is available after delivery' });
        const file = path.join(DRAFTS, order.draftFile);
        const type = order.draftFile.endsWith('.png') ? 'image/png' : 'image/svg+xml';
        res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': `attachment; filename="designdesk-${order.id}-final${path.extname(order.draftFile)}"` });
        return res.end(fs.readFileSync(file));
      }

      return send(res, 404, { error: 'Unknown endpoint' });
    }

    // ---------- PayPal return / cancel ----------
    if (p === '/paypal/return') {
      const token = url.searchParams.get('token');
      const orders = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'orders.json'), 'utf8'));
      const order = Object.values(orders).find(o => o.paypalOrderId === token);
      if (!order) return send(res, 400, 'Unknown PayPal order', 'text/plain');
      try {
        await paypal.captureOrder(token);
        store.update(order.id, { status: 'paid', paidAt: new Date().toISOString(), paymentRef: token });
      } catch (e) { console.error('[paypal] capture failed:', e.message); }
      res.writeHead(302, { Location: '/#order/' + order.id });
      return res.end();
    }
    if (p === '/paypal/cancel') {
      res.writeHead(302, { Location: '/' });
      return res.end();
    }

    // ---------- static ----------
    const file = p === '/' ? 'index.html' : p.slice(1);
    const full = path.join(PUBLIC, path.normalize(file));
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return send(res, 404, 'Not found', 'text/plain');
    }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    return send(res, 200, fs.readFileSync(full), types[path.extname(full)] || 'application/octet-stream');
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`DesignDesk AI running at http://localhost:${PORT}`);
  console.log(`Payment mode: ${paypal.configured() ? 'PayPal sandbox (credentials found)' : 'DEMO (no PayPal credentials — simulated checkout)'}`);
  console.log(`Image mode: ${process.env.IMAGE_API_KEY ? 'AI image API' : 'DEMO (programmatic SVG drafts)'}`);
});
