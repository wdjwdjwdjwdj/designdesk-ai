// DesignDesk AI — pricing engine
// Deterministic quote logic. All prices in USD.
// Documented in README.md ("Pricing logic").

const BASE_PRICES = {
  'logo':          { label: 'Logo',            base: 49 },
  'poster':        { label: 'Poster',          base: 39 },
  'product-image': { label: 'Product image',   base: 29 },
  'avatar':        { label: 'Avatar',          base: 19 },
  'social-kit':    { label: 'Social media kit', base: 79 },
};

const STYLE_MULTIPLIERS = {
  'minimal':   1.0,
  'modern':    1.0,
  'playful':   1.1,
  'vintage':   1.1,
  'luxury':    1.3,
  '3d-render': 1.4,
};

// Words in the brief that signal extra production effort.
const COMPLEXITY_KEYWORDS = ['detailed', 'intricate', 'complex', 'illustration',
  'mascot', 'character', '3d', 'hand-drawn', 'hand drawn', 'pattern', 'scene'];
const RUSH_KEYWORDS = ['rush', 'urgent', 'asap', '24h', '24 hours', 'tomorrow', 'today'];

function complexityFor(description) {
  const words = description.trim().split(/\s+/).filter(Boolean);
  const lower = ' ' + description.toLowerCase() + ' ';
  let tier, multiplier;
  if (words.length <= 15)      { tier = 'Simple';   multiplier = 1.0; }
  else if (words.length <= 40) { tier = 'Standard'; multiplier = 1.25; }
  else                         { tier = 'Complex';  multiplier = 1.6; }

  let hits = 0;
  for (const kw of COMPLEXITY_KEYWORDS) if (lower.includes(kw)) hits++;
  const keywordBoost = Math.min(hits * 0.15, 0.45); // capped at +45%
  const rush = RUSH_KEYWORDS.some(kw => lower.includes(kw));
  return { tier, multiplier, keywordBoost, hits, rush, wordCount: words.length };
}

function quote(type, style, description) {
  const entry = BASE_PRICES[type];
  if (!entry) throw new Error('Unknown design type: ' + type);
  const styleMult = STYLE_MULTIPLIERS[style] ?? 1.0;
  const c = complexityFor(description || '');

  const lines = [];
  lines.push({ label: `${entry.label} — base price`, amount: entry.base });
  let subtotal = entry.base;

  const complexityFee = +(entry.base * (c.multiplier - 1 + c.keywordBoost)).toFixed(2);
  if (complexityFee > 0) {
    lines.push({
      label: `Complexity (${c.tier.toLowerCase()} brief, ${c.wordCount} words` +
             (c.hits ? `, ${c.hits} complexity keyword${c.hits > 1 ? 's' : ''}` : '') + ')',
      amount: complexityFee,
    });
    subtotal += complexityFee;
  }

  const styleFee = +(subtotal * (styleMult - 1)).toFixed(2);
  if (styleFee > 0) {
    lines.push({ label: `Style premium (${style} ×${styleMult})`, amount: styleFee });
    subtotal += styleFee;
  }

  let rushFee = 0;
  if (c.rush) {
    rushFee = +(subtotal * 0.5).toFixed(2);
    lines.push({ label: 'Rush delivery (+50%)', amount: rushFee });
    subtotal += rushFee;
  }

  const total = Math.max(5, Math.round(subtotal));
  return { currency: 'USD', total, lines, tier: c.tier, rush: c.rush };
}

module.exports = { BASE_PRICES, STYLE_MULTIPLIERS, quote };
