// DesignDesk AI — PayPal Checkout (Orders v2) integration.
// Credentials come from the environment only. When they are absent the app
// runs in demo payment mode (clearly labelled SANDBOX DEMO MODE in the UI).

function configured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function baseUrl() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function accessToken() {
  const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString('base64');
  const res = await fetch(baseUrl() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal auth failed: HTTP ' + res.status);
  const data = await res.json();
  return data.access_token;
}

async function createOrder(order, returnBase) {
  const token = await accessToken();
  const res = await fetch(baseUrl() + '/v2/checkout/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id,
        description: `DesignDesk AI — ${order.typeLabel} (${order.id})`,
        amount: { currency_code: 'USD', value: order.quote.total.toFixed(2) },
      }],
      application_context: {
        brand_name: 'DesignDesk AI',
        user_action: 'PAY_NOW',
        return_url: returnBase + '/paypal/return',
        cancel_url: returnBase + '/paypal/cancel',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal create order failed: ' + JSON.stringify(data));
  const approve = (data.links || []).find(l => l.rel === 'approve');
  return { paypalOrderId: data.id, approveUrl: approve && approve.href };
}

async function captureOrder(paypalOrderId) {
  const token = await accessToken();
  const res = await fetch(baseUrl() + '/v2/checkout/orders/' + paypalOrderId + '/capture', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal capture failed: ' + JSON.stringify(data));
  return data;
}

module.exports = { configured, createOrder, captureOrder };
