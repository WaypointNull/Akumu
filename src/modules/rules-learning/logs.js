const fs = require('fs');
const { normalizeTag } = require('../tag-resolution');

function loadLogInputs(logPaths) {
  const tally = new Map();
  for (const f of logPaths) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const inputs = e.concepts ? e.concepts.map((c) => c.original) : [e.input];
      for (const i of inputs) {
        const key = normalizeTag(i);
        if (!key) continue;
        tally.set(key, (tally.get(key) || 0) + 1);
      }
    }
  }
  return tally;
}

module.exports = { loadLogInputs };
