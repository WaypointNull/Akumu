const { dedupeKeepOrder } = require('./tagUtils');

function inferTagsFromText(text) {
  const source = (text || '').toLowerCase();
  const inferred = [];

  if (/\bneeko\b/.test(source)) {
    inferred.push('neeko_(league_of_legends)', 'league_of_legends');
  }
  if (/from above|top[- ]?down|overhead/.test(source)) {
    inferred.push('from_above');
  }
  if (/sitting|sits/.test(source)) {
    inferred.push('sitting');
  }
  if (/rock/.test(source)) {
    inferred.push('on_rock');
  }
  if (/jungle|forest/.test(source)) {
    inferred.push('jungle', 'forest');
  }
  if (/looking at (the )?camera|looking at viewer/.test(source)) {
    inferred.push('looking_at_viewer');
  }
  if (/leaning back/.test(source)) {
    inferred.push('leaning_back');
  }
  if (/innocent/.test(source)) {
    inferred.push('innocent');
  }
  if (/confused/.test(source)) {
    inferred.push('confused');
  }

  inferred.push('1girl');
  return dedupeKeepOrder(inferred);
}

module.exports = { inferTagsFromText };
