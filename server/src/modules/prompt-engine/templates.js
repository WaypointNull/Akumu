function buildPass1System() {
  return [
    'Translate natural language image descriptions into a dense list of existing Danbooru tags.',
    'Give every visible detail its own tag. A single item can yield several tags: a "black bikini" becomes black_bikini, highleg_bikini, and swimsuit. Split details into separate specific tags rather than merging them.',
    'Colors attach to the item they describe ("red dress", "red hair") — never a bare color word.',
    'Prefer exact, widely-used canonical Danbooru tags.',
    'If no single canonical tag fits, express the idea using multiple existing tags.',
    'Do not invent new compound tags or descriptive phrases.',
    'Examples:',
    '"a girl with pink hair and purple eyes sitting in a short white dress, white wings, white thighhighs, looking at the viewer" -> 1girl, solo, sitting, yokozuwari, pink_hair, purple_eyes, pointy_ears, white_wings, wings, white_dress, short_dress, detached_sleeves, thighhighs, white_thighhighs, bare_shoulders, hair_bow, hair_ornament, long_hair, smile, looking_at_viewer, from_above',
    '"a blonde demon girl with wings in a black bikini at night, moonlight through a window, tongue out" -> 1girl, solo, blonde_hair, demon_girl, demon_tail, fangs, head_wings, wings, black_bikini, highleg_bikini, thong_bikini, large_breasts, long_hair, night, moonlight, full_moon, moon, window, curtains, tongue_out, smile, pink_eyes, looking_at_viewer',
    '"a girl with brown hair and brown eyes in a wet white tank top and shorts, wading at night, mountain horizon" -> 1girl, solo, brown_hair, brown_eyes, white_tank_top, tank_top, wet, wet_clothes, white_shorts, short_shorts, wading, night, mountain, mountainous_horizon, sky, leaning_forward, looking_at_viewer, smile, sunglasses, eyewear_on_head, large_breasts, thighs',
    'Output only comma-separated lowercase tags with underscores.',
    'No prose, explanations, headings, or formatting.'
  ].join(' ');
}

function buildLoraContext(loraInput) {
  const tags = (loraInput || '')
    .trim()
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (tags.length === 0) return '';
  return ['LoRA tags (context — do NOT output these, they are inserted separately):', tags.join(', '), ''].join('\n');
}

function buildPass1Prompt(naturalLanguage, loraInput = '') {
  const loraContext = buildLoraContext(loraInput);
  return [
    loraContext,
    `Request: ${naturalLanguage}`,
    'Return a dense, complete tag list — approximately 20-30 comma-separated tags for a detailed scene, fewer if the description is genuinely short.',
    'Never summarize several details into one tag.',
    'Do not invent tags.'
  ].join('\n');
}

module.exports = {
  buildPass1System,
  buildPass1Prompt
};
