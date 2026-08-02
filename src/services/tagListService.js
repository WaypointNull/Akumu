const fs = require('fs');
const path = require('path');
const { TAG_FILE_PATH, TAG_LIST_URL } = require('../config/constants');
const { normalizeTag, isUsableTag } = require('../utils/tagUtils');

let tagSet = new Set();

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

  const tagText = fs.readFileSync(TAG_FILE_PATH, 'utf8');
  tagSet = new Set(
    tagText
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .map((line) => line.split(',')[0].trim())
      .map((line) => normalizeTag(line))
      .filter((line) => isUsableTag(line))
      .filter(Boolean)
  );
}

function getTagSet() {
  return tagSet;
}

module.exports = {
  ensureTagList,
  getTagSet
};
