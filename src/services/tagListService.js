const fs = require('fs');
const path = require('path');
const { TAG_FILE_PATH, TAG_LIST_URL } = require('../config/constants');
const { normalizeTag, isUsableTag } = require('../utils/tagUtils');

let tagSet = new Set();
let tagMeta = new Map();
let aliasToCanonical = new Map();
let canonicalToAliases = new Map();
let collisions = new Map();

async function ensureTagList() {
  fs.mkdirSync(path.dirname(TAG_FILE_PATH), { recursive: true });

  if (!fs.existsSync(TAG_FILE_PATH)) {
    const response = await fetch(TAG_LIST_URL);
    if (!response.ok) {
      throw new Error(`Could not download danbooru tags (${response.status}).`);
    }
    const text = await response.text();
    fs.writeFileSync(TAG_FILE_PATH, text, 'utf8');
  }

  const records = parseCsvRecords(fs.readFileSync(TAG_FILE_PATH, 'utf8'));

  tagSet = new Set();
  tagMeta = new Map();
  aliasToCanonical = new Map();
  canonicalToAliases = new Map();
  collisions = new Map();

  for (const record of records) {
    const canonical = normalizeTag(record.tag);
    if (!isUsableTag(canonical)) {
      continue;
    }
    tagSet.add(canonical);
    tagMeta.set(canonical, {
      category: record.category,
      postCount: Number(record.posts) || 0
    });
  }

  for (const record of records) {
    const canonical = normalizeTag(record.tag);
    if (!tagSet.has(canonical)) {
      continue;
    }
    for (const alias of record.aliases) {
      const key = normalizeTag(alias);
      if (!key || !isUsableTag(key) || key === canonical) {
        continue;
      }
      const existing = aliasToCanonical.get(key);
      if (existing === undefined) {
        aliasToCanonical.set(key, canonical);
        continue;
      }
      if (existing === canonical) {
        continue;
      }
      if (!collisions.has(key)) {
        collisions.set(key, [{ tag: existing, postCount: tagMeta.get(existing)?.postCount || 0 }]);
      }
      collisions.get(key).push({ tag: canonical, postCount: tagMeta.get(canonical)?.postCount || 0 });
    }
  }

  for (const [alias, candidates] of collisions) {
    const winner = candidates.reduce((best, candidate) => (candidate.postCount > best.postCount ? candidate : best));
    aliasToCanonical.set(alias, winner.tag);
  }

  for (const [alias, canonical] of aliasToCanonical) {
    const list = canonicalToAliases.get(canonical) || [];
    list.push(alias);
    canonicalToAliases.set(canonical, list);
  }

  return {
    tags: tagSet.size,
    aliases: aliasToCanonical.size,
    collisions: collisions.size
  };
}

function getTagSet() {
  return tagSet;
}

function getTagMeta(tag) {
  const key = normalizeTag(tag);
  return tagMeta.get(key) || null;
}

function resolveAlias(tag) {
  const key = normalizeTag(tag);
  return aliasToCanonical.get(key) || null;
}

function getAliasMap() {
  return aliasToCanonical;
}

function getCanonicalAliases(tag) {
  const key = normalizeTag(tag);
  return canonicalToAliases.get(key) || [];
}

function getAliasCollisions() {
  return collisions;
}

function resolveTag(tag) {
  const key = normalizeTag(tag);
  if (tagSet.has(key)) {
    return { status: 'exact', tag: key };
  }
  const canonical = aliasToCanonical.get(key);
  if (canonical) {
    return { status: 'alias', tag: canonical };
  }
  return { status: 'unknown', tag: key };
}

function parseCsvRecords(text) {
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const cols = parseCsvLine(line);
    if (cols.length < 3 || !cols[0] || !cols[1]) {
      continue;
    }
    records.push({
      tag: cols[0].trim(),
      category: cols[1].trim(),
      posts: cols[2].trim(),
      aliases: cols[3] ? cols[3].split(',').map((value) => value.trim()).filter(Boolean) : []
    });
  }
  return records;
}

function parseCsvLine(line) {
  const cols = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      cols.push(field);
      field = '';
      continue;
    }
    field += char;
  }
  cols.push(field);
  return cols;
}

module.exports = {
  ensureTagList,
  getTagSet,
  getTagMeta,
  resolveAlias,
  getAliasMap,
  getCanonicalAliases,
  getAliasCollisions,
  resolveTag
};
