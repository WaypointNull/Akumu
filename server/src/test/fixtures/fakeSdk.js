const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  ready: async () => 'ok',
  record: async (schema, payload) => {
    fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify({ schema, payload }) + '\n');
  }
};
