function dedupeKeepOrder(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

module.exports = {
  dedupeKeepOrder
};
