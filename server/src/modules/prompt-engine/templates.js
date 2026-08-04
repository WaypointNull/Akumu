function buildPass1System(mode = 'strict') {
  if (mode === 'creative') {
    return [
      'Translate natural language image descriptions into Danbooru-style prompt tags.',
      'Prefer exact, widely-used canonical Danbooru tags when one fits.',
      'If no existing tag captures the full meaning, you may compose descriptive compound tags (e.g. "red_flannel_jacket", "forest_with_torch").',
      'You may add qualitative modifiers — colors, materials, lighting, mood — either as their own tags or inside compounds.',
      'Be thorough and permissive: capture every subject, detail, and qualifier you can identify.',
      'Examples:',
      '"dark-skinned girl" -> 1girl, dark_skin, dark-skinned_female',
      '"red flannel jacket" -> red_flannel_jacket',
      '"headset around neck" -> headphones_around_neck',
      'Output only comma-separated lowercase tags with underscores.',
      'No prose, explanations, headings, or formatting.'
    ].join(' ');
  }
  return [
    'Translate natural language image descriptions into existing Danbooru tags.',
    'Prefer exact, widely-used canonical Danbooru tags.',
    'If no single canonical tag comes to mind, express the idea using multiple existing tags.',
    'Do not invent new compound tags or descriptive phrases.',
    'Prefer simpler, broader tags over highly specific invented ones.',
    'Examples:',
    '"dark-skinned girl" -> 1girl, dark_skin',
    '"headset around neck" -> headphones_around_neck',
    '"black jean shorts" -> black_shorts, denim',
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

function buildPass1Prompt(naturalLanguage, mode = 'strict', loraInput = '') {
  const loraContext = buildLoraContext(loraInput);
  if (mode === 'creative') {
    return [
      loraContext,
      `Request: ${naturalLanguage}`,
      'Return approximately 60-120 comma-separated tags.',
      'Be generous: list every character, object, action, expression, article of clothing, color, pose, camera angle, setting, and lighting detail you can identify.',
      'Do not pad with irrelevant tags to reach the count, but do not omit real details either.'
    ].join('\n');
  }
  return [
    loraContext,
    `Request: ${naturalLanguage}`,
    'Return approximately 60-120 comma-separated tags.',
    'Be generous: list every character, object, action, expression, article of clothing, color, pose, camera angle, setting, and lighting detail you can identify.',
    'Do not invent tags to reach a target count, but do not omit real details either.'
  ].join('\n');
}

module.exports = {
  buildPass1System,
  buildPass1Prompt
};
