function trigrams(str) {
  const out = new Set();
  if (str.length < 3) {
    if (str.length > 0) out.add(str);
    return out;
  }
  for (let i = 0; i <= str.length - 3; i++) {
    out.add(str.slice(i, i + 3));
  }
  return out;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev2 = new Array(n + 1);
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
    }
    const swap = prev2;
    prev2 = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

module.exports = { trigrams, tokenize, damerauLevenshtein };
