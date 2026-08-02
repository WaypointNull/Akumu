function parseRegionalText(text) {
  const source = text || '';
  const get = (name) => {
    const re = new RegExp(`${name}\\s*:\\s*([^\\n]*)`, 'i');
    const m = source.match(re);
    return m ? m[1].trim() : '';
  };

  return {
    red: get('RED'),
    green: get('GREEN'),
    blue: get('BLUE'),
    globalNegative: get('GLOBAL_NEGATIVE')
  };
}

module.exports = { parseRegionalText };
