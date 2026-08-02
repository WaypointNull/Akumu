const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const CASES_FILE = path.join(DATA_DIR, 'benchmark-cases.json');

const CATEGORY_SIZES = {
  alias: 1500,
  missing_underscore: 250,
  space: 250,
  hyphen: 250,
  typo: 250,
  truncate: 250,
  plural: 200,
  prefix: 200
};

const SEED = 20260802;

function loadCases() {
  if (!fs.existsSync(CASES_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')).cases;
}

module.exports = {
  DATA_DIR,
  CASES_FILE,
  CATEGORY_SIZES,
  SEED,
  loadCases
};
