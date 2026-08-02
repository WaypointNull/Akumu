function buildCanonicalizeSystem() {
  return [
    'You pick which Danbooru tags best express an image concept.',
    'Each pending concept line is: N. concept -> 1: candidate, 2: candidate, ...',
    'N is the concept number (the number before the dot). Candidates are numbered 1, 2, ... sorted by retrieval relevance (strongest match first).',
    'For each concept, output exactly one line:',
    'N: candidate numbers you choose',
    'or',
    'N: SKIP',
    'using the same N (the number before the dot).',
    'Example:',
    '  3. fluffy_cat -> 1: cat  2: fluffy  3: cat_ears  4: white_cat',
    'Output:',
    '  3: 2, 3',
    'Rules:',
    '- Never output tag text. Output only candidate numbers.',
    '- Prefer lower candidate numbers: they are stronger retrieval matches.',
    '- Select at most 3 candidate numbers per concept; prefer 1 or 2.',
    '- Do not select candidates that already appear in the already-canonical list.',
    '- Emit SKIP if no candidate confidently expresses the concept.',
    'No prose or explanations.'
  ].join(' ');
}

function buildCanonicalizeUser({ request, resolvedTags, concepts }) {
  const lines = [];
  if (request) lines.push(`Original request: ${request}`);
  if (resolvedTags && resolvedTags.length) {
    lines.push(`Already-canonical tags (do not repeat): ${resolvedTags.join(', ')}`);
  }
  lines.push('Pending concepts to canonicalize:');
  for (const c of concepts) {
    const cands = c.candidates.map((x, i) => `${i + 1}: ${x.tag}`).join('  ');
    lines.push(`${c.index}. ${c.original} -> ${cands}`);
  }
  return lines.join('\n');
}

function parseCanonicalizeOutput(raw) {
  const out = new Map();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s*[:.\-]\s*(.+)$/i);
    if (!m) continue;
    const index = parseInt(m[1], 10);
    const content = m[2].trim();
    if (/^skip$/i.test(content)) {
      out.set(index, []);
      continue;
    }
    if (!/^\d+(\s*,\s*\d+)*$/.test(content)) continue;
    out.set(index, content.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1));
  }
  return out;
}

module.exports = {
  buildCanonicalizeSystem,
  buildCanonicalizeUser,
  parseCanonicalizeOutput
};
