const {
  NSFW_EXACT_TOKENS,
  NSFW_EXACT_TAGS,
  CLOTHES_EXACT_TOKENS,
  CLOTHES_EXACT_TAGS,
  COMPOSITION_EXACT_TAGS,
  POSE_EXACT_TOKENS,
  POSE_EXACT_TAGS
} = require('./dictionaries');
const { NSFW_EXCLUSIONS, CLOTHES_EXCLUSIONS, POSE_EXCLUSIONS } = require('./exclusions');

const CATEGORIES = [
  {
    id: 'nsfw',
    label: 'NSFW',
    exactTokens: NSFW_EXACT_TOKENS,
    exactTags: NSFW_EXACT_TAGS,
    exclusions: NSFW_EXCLUSIONS
  },
  {
    id: 'clothes',
    label: 'Clothes',
    exactTokens: CLOTHES_EXACT_TOKENS,
    exactTags: CLOTHES_EXACT_TAGS,
    exclusions: CLOTHES_EXCLUSIONS
  },
  {
    id: 'composition',
    label: 'Composition',
    exactTokens: new Set(),
    exactTags: COMPOSITION_EXACT_TAGS,
    exclusions: new Set()
  },
  {
    id: 'pose',
    label: 'Pose / Expression',
    exactTokens: POSE_EXACT_TOKENS,
    exactTags: POSE_EXACT_TAGS,
    exclusions: POSE_EXCLUSIONS
  }
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

function normalizeName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tokenize(text) {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

function matches(name, category) {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (category.exclusions.has(normalized)) return false;
  if (category.exactTags.has(normalized)) return true;
  const tokens = tokenize(normalized);
  for (const token of tokens) {
    if (category.exactTokens.has(token)) return true;
  }
  return false;
}

function isCategory(name, categoryId) {
  const category = BY_ID.get(categoryId);
  return Boolean(category && matches(name, category));
}

function categories() {
  return CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
}

function classify(name) {
  return CATEGORIES.filter((c) => matches(name, c)).map((c) => c.id);
}

module.exports = { categories, classify, isCategory };
