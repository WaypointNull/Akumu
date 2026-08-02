const fs = require('fs');
const path = require('path');
const { normalizeTag } = require('./parser');

const RESOLUTIONS_PATH = path.join(__dirname, '..', '..', '..', 'data', 'resolutions.json');

function createRuleTable({ repository }) {
  let table = null;

  function loadResolutions() {
    if (table) return table;
    table = new Map();
    try {
      if (fs.existsSync(RESOLUTIONS_PATH)) {
        const json = JSON.parse(fs.readFileSync(RESOLUTIONS_PATH, 'utf8'));
        for (const [input, tags] of Object.entries(json)) {
          if (!Array.isArray(tags) || !tags.length) continue;
          table.set(normalizeTag(input), tags);
        }
      }
    } catch (error) {
      console.warn('[rules] failed to load resolutions:', error.message);
    }
    return table;
  }

  function getResolution(input) {
    return loadResolutions().get(normalizeTag(input)) || null;
  }

  function resolveWithRules(input) {
    const tags = getResolution(input);
    if (!tags) return null;
    const canon = [];
    for (const t of tags) {
      const r = repository.resolveTag(t);
      if (r.status === 'unknown') continue;
      if (!canon.includes(r.tag)) canon.push(r.tag);
    }
    if (!canon.length) return null;
    return { status: 'rule', tag: canon[0], extraTags: canon.slice(1) };
  }

  return {
    loadResolutions,
    getResolution,
    resolveWithRules
  };
}

module.exports = { createRuleTable, RESOLUTIONS_PATH };
