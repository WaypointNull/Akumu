function buildReviewSystem() {
  return [
    'You are an offline tag-curation assistant for the Danbooru vocabulary.',
    'Each line is: INDEX. input -> 1: candidate, 2: candidate, ...',
    'The input is an unresolved or invented tag. Recommend the best existing Danbooru tag(s) that express the same concept, or SKIP if none fit.',
    'For each input line, reply exactly one line that STARTS with the same INDEX number (e.g. if the input line starts with "3.", your reply line starts with "3:").',
    'Example input:',
    '0. kashick -> 1: kashi-k, 2: kashi, 3: kashia',
    'Example reply:',
    '0: kashi-k | exact typo',
    'Never invent tags; only use candidate tags or well-known real Danbooru tags.',
    'Prefer the lowest-numbered candidates (strongest retrieval matches).',
    'Use at most 2 tags per input.',
    'No other text.'
  ].join(' ');
}

function parseAnnotations(raw) {
  const out = new Map();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s*[:.-]\s*(.+)$/i);
    if (!m) continue;
    const index = parseInt(m[1], 10);
    const content = m[2];
    const reasonMatch = content.match(/^(.+?)\s*\|\s*(.+)$/);
    const body = reasonMatch ? reasonMatch[1].trim() : content.trim();
    const reason = reasonMatch ? reasonMatch[2].trim() : '';
    if (/^skip$/i.test(body)) {
      out.set(index, { tags: [], reason });
      continue;
    }
    const tags = body
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => /^[a-z0-9_()'-]+$/.test(t));
    out.set(index, { tags, reason });
  }
  return out;
}

async function annotate(review, deps, { model, batchSize = 15 } = {}) {
  const annotated = [];
  for (let start = 0; start < review.length; start += batchSize) {
    const batch = review.slice(start, start + batchSize);
    const lines = [];
    for (const e of batch) {
      const cands = e.candidates.map((c, i) => `${i + 1}: ${c.tag}`).join('  ');
      lines.push(`${e.index}. ${e.input} -> ${cands}`);
    }
    const raw = await deps.llm.ollamaGenerate(model, buildReviewSystem(), lines.join('\n'), 0.05);
    const parsed = parseAnnotations(raw);
    for (const e of batch) {
      const ann = parsed.get(e.index) || { tags: [], reason: '(no annotation parsed)' };
      const byCand = new Map(e.candidates.map((c, i) => [String(i + 1), c.tag]));
      ann.tags = ann.tags.map((t) => byCand.get(t) || t);
      annotated.push({ ...e, llm: ann });
    }
  }
  return annotated;
}

module.exports = { buildReviewSystem, parseAnnotations, annotate };
