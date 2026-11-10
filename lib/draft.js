// DesignDesk AI — draft generation.
//
// Primary path: an OpenAI-compatible Images API (IMAGE_API_KEY / IMAGE_API_BASE /
// IMAGE_MODEL). Fallback path (no key, or API error): a fully programmatic SVG
// "design draft" rendered from the brief — real layout, palette and typography
// derived from the order, never a blank image. Fallback drafts are labelled
// DEMO MODE in the UI.

const fs = require('fs');
const path = require('path');

const PALETTES = {
  'minimal':   { bg1: '#f7f5f0', bg2: '#e9e6dd', ink: '#16181d', accent: '#16181d', sub: '#6b6f76' },
  'modern':    { bg1: '#0b2545', bg2: '#13608f', ink: '#ffffff', accent: '#ffd166', sub: '#cfe3f2' },
  'playful':   { bg1: '#ff8fab', bg2: '#ffc2d4', ink: '#3a0ca3', accent: '#ffe45e', sub: '#5a189a' },
  'vintage':   { bg1: '#e8dcc3', bg2: '#d6c096', ink: '#4a3421', accent: '#9c6644', sub: '#7a5c3e' },
  'luxury':    { bg1: '#0d0d0f', bg2: '#232326', ink: '#f5eeda', accent: '#c9a227', sub: '#a8a294' },
  '3d-render': { bg1: '#1b1035', bg2: '#4c1d95', ink: '#ffffff', accent: '#22d3ee', sub: '#cdc2f5' },
};

const CANVAS = {
  'logo':          { w: 1000, h: 1000 },
  'avatar':        { w: 1000, h: 1000 },
  'poster':        { w: 900,  h: 1200 },
  'product-image': { w: 1200, h: 900 },
  'social-kit':    { w: 1200, h: 628 },
};

const STOPWORDS = new Set(('a an the for of to and or with in on at by from is are be it its this that i we our you your want need like please make design designed').split(' '));

function keywordsFrom(text, n = 4) {
  const seen = new Set();
  const out = [];
  for (const raw of (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)) {
    const w = raw.trim();
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

// Deterministic pseudo-random from a seed string (stable shapes per order).
function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapWords(text, perLine = 22) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function generateSvgDraft(order) {
  const { w, h } = CANVAS[order.type] || CANVAS['product-image'];
  const pal = PALETTES[order.style] || PALETTES.modern;
  const rand = rng(order.id);
  const kws = keywordsFrom(order.description);
  const headline = (kws.slice(0, 2).join(' ') || order.typeLabel).toUpperCase();
  const subline = kws.slice(2).join('  ·  ') || order.style + ' style';
  const briefLines = wrapWords(order.description, 46);

  let shapes = '';
  for (let i = 0; i < 5; i++) {
    const cx = Math.round(rand() * w), cy = Math.round(rand() * h);
    const r = Math.round(40 + rand() * 150);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pal.accent}" opacity="${(0.10 + rand() * 0.14).toFixed(2)}"/>\n  `;
  }
  const barY = Math.round(h * 0.16);
  shapes += `<rect x="${Math.round(w * 0.08)}" y="${barY}" width="${Math.round(w * 0.14)}" height="8" fill="${pal.accent}"/>`;

  const cx = w / 2;
  const headY = Math.round(h * 0.44);
  const headSize = Math.round(Math.min(w, h) * (headline.length > 12 ? 0.085 : 0.115));
  const briefTspans = briefLines
    .map((l, i) => `<text x="${cx}" y="${Math.round(h * 0.60) + i * 30}" font-size="21" fill="${pal.sub}" text-anchor="middle" font-family="Georgia, serif" font-style="italic">${esc(l)}</text>`)
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${pal.bg1}"/><stop offset="1" stop-color="${pal.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${shapes}
  <text x="${cx}" y="${Math.round(h * 0.30)}" font-size="24" letter-spacing="6" fill="${pal.accent}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(order.typeLabel.toUpperCase())} — DRAFT CONCEPT</text>
  <text x="${cx}" y="${headY}" font-size="${headSize}" font-weight="bold" fill="${pal.ink}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(headline)}</text>
  <text x="${cx}" y="${headY + Math.round(headSize * 0.75)}" font-size="27" letter-spacing="3" fill="${pal.sub}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(subline)}</text>
  ${briefTspans}
  <text x="${cx}" y="${h - 34}" font-size="18" fill="${pal.sub}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">DesignDesk AI · Order ${esc(order.id)} · Demo draft — final artwork delivered after payment</text>
</svg>`;
}

async function callImageApi(order) {
  const base = (process.env.IMAGE_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.IMAGE_MODEL || 'gpt-image-1';
  const prompt = `Professional ${order.typeLabel.toLowerCase()} design, ${order.style} style. Brief: ${order.description}. Clean commercial design, no watermark.`;
  const res = await fetch(base + '/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.IMAGE_API_KEY },
    body: JSON.stringify({ model, prompt, size: '1024x1024' }),
  });
  if (!res.ok) throw new Error('Image API HTTP ' + res.status);
  const data = await res.json();
  const item = data && data.data && data.data[0];
  if (!item) throw new Error('Image API returned no image');
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error('Image download HTTP ' + img.status);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('Image API returned neither b64_json nor url');
}

// Returns { file, mode } where mode is 'ai' or 'demo'.
async function generateDraft(order, draftsDir) {
  if (process.env.IMAGE_API_KEY) {
    try {
      const buf = await callImageApi(order);
      const file = order.id + '.png';
      fs.writeFileSync(path.join(draftsDir, file), buf);
      return { file, mode: 'ai' };
    } catch (err) {
      console.error('[draft] image API failed, falling back to demo draft:', err.message);
    }
  }
  const file = order.id + '.svg';
  fs.writeFileSync(path.join(draftsDir, file), generateSvgDraft(order), 'utf8');
  return { file, mode: 'demo' };
}

module.exports = { generateDraft, generateSvgDraft };
