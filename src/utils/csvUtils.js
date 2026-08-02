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

module.exports = { parseCsvRecords, parseCsvLine };
