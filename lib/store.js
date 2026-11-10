// DesignDesk AI — tiny JSON-file order store (no database, by design).

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'orders.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}

function saveAll(orders) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(orders, null, 2));
}

function create(order) {
  const orders = load();
  orders[order.id] = order;
  saveAll(orders);
  return order;
}

function get(id) {
  return load()[id] || null;
}

function update(id, patch) {
  const orders = load();
  if (!orders[id]) return null;
  Object.assign(orders[id], patch, { updatedAt: new Date().toISOString() });
  saveAll(orders);
  return orders[id];
}

function newOrderId() {
  const orders = load();
  let id;
  do {
    id = 'DD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (orders[id]);
  return id;
}

module.exports = { create, get, update, newOrderId };
