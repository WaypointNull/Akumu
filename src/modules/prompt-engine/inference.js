const { dedupeKeepOrder } = require('../../shared/list');
const RULES = require('./tag-inference.json');

const compiledRules = RULES.rules.map((rule) => ({
  re: new RegExp(rule.pattern),
  tags: rule.tags
}));

function inferTagsFromText(text) {
  const source = (text || '').toLowerCase();
  const inferred = [];

  for (const rule of compiledRules) {
    if (rule.re.test(source)) {
      inferred.push(...rule.tags);
    }
  }

  inferred.push(...RULES.always);
  return dedupeKeepOrder(inferred);
}

module.exports = { inferTagsFromText };
