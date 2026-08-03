const fs = require('fs');
const { BENCHMARK_DIR, CASES_FILE, CATEGORY_SIZES, SEED, loadCases } = require('./datasets');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function corruptMissingUnderscore(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + tag.slice(i + 1);
}

function corruptSpace(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + ' ' + tag.slice(i + 1);
}

function corruptHyphen(tag) {
  const i = tag.indexOf('_');
  return i === -1 ? null : tag.slice(0, i) + '-' + tag.slice(i + 1);
}

function corruptTypo(rng, tag) {
  const pos = Math.floor(rng() * tag.length);
  const letter = String.fromCharCode(97 + Math.floor(rng() * 26));
  return tag.slice(0, pos) + letter + tag.slice(pos + 1);
}

function corruptTruncate(rng, tag) {
  const cut = 1 + Math.floor(rng() * 3);
  if (tag.length - cut < 4) return null;
  return tag.slice(0, tag.length - cut);
}

function corruptPlural(tag) {
  const last = tag.lastIndexOf('_');
  const base = last === -1 ? tag : tag.slice(last + 1);
  if (!base || base.endsWith('s')) return null;
  return tag + 's';
}

function corruptPrefix(rng, tag) {
  const prefixes = ['the_', 'a_', 'with_', 'of_', 'an_'];
  return pick(rng, prefixes) + tag;
}

function isValidCorruption(input, expected, deps) {
  const result = deps.repository.resolveTag(input);
  if (result.status === 'unknown') return true;
  return result.tag === expected;
}

function generate(deps) {
  const rng = mulberry32(SEED);
  const tagSet = deps.repository.getTagSet();
  const pool = [...tagSet].filter((tag) => tag.length >= 6 && !/^\d/.test(tag));
  const multiWord = pool.filter((tag) => tag.includes('_'));
  const seen = new Set();
  const cases = [];

  const corruptors = {
    missing_underscore: { pool: multiWord, fn: (tag) => corruptMissingUnderscore(tag) },
    space: { pool: multiWord, fn: (tag) => corruptSpace(tag) },
    hyphen: { pool: multiWord, fn: (tag) => corruptHyphen(tag) },
    typo: { pool, fn: (tag) => corruptTypo(rng, tag) },
    truncate: { pool, fn: (tag) => corruptTruncate(rng, tag) },
    plural: { pool, fn: (tag) => corruptPlural(tag) },
    prefix: { pool, fn: (tag) => corruptPrefix(rng, tag) }
  };

  for (const [category, spec] of Object.entries(corruptors)) {
    const out = [];
    let attempts = 0;
    const maxAttempts = CATEGORY_SIZES[category] * 40;
    while (out.length < CATEGORY_SIZES[category] && attempts < maxAttempts) {
      attempts++;
      const tag = pick(rng, spec.pool);
      const input = spec.fn(tag);
      if (!input || input === tag || seen.has(input)) continue;
      if (!isValidCorruption(input, tag, deps)) continue;
      seen.add(input);
      out.push({ category, input, expected: tag });
    }
    cases.push(...out);
  }

  const entries = [...deps.repository.getAliasMap()].filter(([alias]) => alias.length >= 4);
  let aliasCount = 0;
  for (const [alias, canonical] of shuffle(rng, entries)) {
    if (aliasCount >= CATEGORY_SIZES.alias) break;
    if (seen.has(alias)) continue;
    if (deps.repository.resolveTag(alias).tag !== canonical) continue;
    seen.add(alias);
    cases.push({ category: 'alias', input: alias, expected: canonical });
    aliasCount++;
  }

  fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
  fs.writeFileSync(
    CASES_FILE,
    JSON.stringify({ version: 1, seed: SEED, generatedAt: new Date().toISOString(), cases }, null, 2),
    'utf8'
  );

  const byCategory = {};
  for (const c of cases) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  console.log('Generated', cases.length, 'cases ->', CASES_FILE);
  console.log(byCategory);
}

function ensureCases(deps) {
  let cases = loadCases();
  if (!cases) {
    generate(deps);
    cases = loadCases();
  }
  return cases;
}

module.exports = {
  generate,
  ensureCases,
  loadCases,
  mulberry32,
  pick,
  shuffle
};
