const { JUNK_TOKENS } = require('../config/constants');

function normalizeTag(tag) {
  return (tag || '')
    .trim()
    .toLowerCase()
    .replace(/^\d+[\s.:\-]+/, '')
    .replace(/^[-*\s.:]+/, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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

function isUsableTag(tag) {
  if (!tag) {
    return false;
  }
  if (!/^[a-z0-9_()'\-]+$/.test(tag)) {
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

function formatTagBlock(tags, chunkSize = 14) {
  const lines = [];
  for (let index = 0; index < tags.length; index += chunkSize) {
    lines.push(tags.slice(index, index + chunkSize).join(', '));
  }
  return lines.join('\n');
}

module.exports = {
  normalizeTag,
  dedupeKeepOrder,
  isUsableTag,
  splitTags,
  parseLoraInput,
  isSectionLabel,
  formatTagBlock
};
