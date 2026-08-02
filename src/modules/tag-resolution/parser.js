const { JUNK_TOKENS } = require('../../config/constants');
const { dedupeKeepOrder } = require('../../shared/list');

function normalizeTag(tag) {
  return (tag || '')
    .trim()
    .toLowerCase()
    .replace(/^\d+[\s.:-]+/, '')
    .replace(/^[-*\s.:]+/, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isUsableTag(tag) {
  if (!tag) {
    return false;
  }
  if (!/^[a-z0-9_()'-]+$/.test(tag)) {
    return false;
  }
  if (tag.length < 3 && !/^\d+(girl|girls|boy|boys)$/.test(tag)) {
    return false;
  }
  if (JUNK_TOKENS.has(tag)) {
    return false;
  }
  return true;
}

function splitTags(text) {
  return dedupeKeepOrder(
    (text || '')
      .replace(/\r/g, '')
      .split(/[\n,]+/)
      .map((value) => normalizeTag(value))
      .filter(Boolean)
      .filter((value) => !value.startsWith('<lora:'))
      .filter((value) => !value.startsWith('lora:'))
      .filter((value) => !/^\d+$/.test(value))
      .filter((value) => isUsableTag(value))
  );
}

function parseLoraInput(text) {
  if (!text) {
    return [];
  }
  return dedupeKeepOrder(
    text
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => value.startsWith('<lora:') && value.endsWith('>'))
  );
}

function isSectionLabel(tag) {
  return new Set([
    'global_positive',
    'global_negative',
    'positive',
    'negative',
    'quality_and_style',
    'character_and_franchise',
    'appearance_and_outfit',
    'pose_and_camera',
    'environment_and_lighting'
  ]).has(tag);
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
      aliases: cols[3]
        ? cols[3]
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : []
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
  normalizeTag,
  isUsableTag,
  splitTags,
  parseLoraInput,
  isSectionLabel,
  parseCsvRecords,
  parseCsvLine
};
