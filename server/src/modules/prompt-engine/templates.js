function buildPass1System() {
  return [
    'Translate natural language image descriptions into a dense list of existing Danbooru tags.',
    'Break the description into its smallest meaningful details and give every detail its own tag. Split single items into multiple tags: a "red flannel jacket" becomes red_jacket, flannel, jacket, and red.',
    'Prefer exact, widely-used canonical Danbooru tags.',
    'If no single canonical tag fits, express the idea using multiple existing tags.',
    'Do not invent new compound tags or descriptive phrases.',
    'Examples:',
    '"dark-skinned girl" -> 1girl, dark_skin, solo',
    '"a girl with red hair and green eyes, wearing a hat and a sweater, sitting on a bench in a park" -> 1girl, red_hair, green_eyes, hat, sweater, sitting, bench, park, outdoors, solo',
    '"a knight in a red flannel jacket, standing at the edge of a dark forest at dusk, torch in hand" -> 1boy, knight, red_jacket, flannel, jacket, red, standing, full_body, holding, torch, flame, dark_forest, dusk, night, outdoors, trees',
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
    'Return at least 20 comma-separated tags (up to 40).',
    'Decompose the description into individual details and give every detail its own tag — never summarize a detail into one broad tag.',
    'Include the character count, pose, framing, setting, lighting, and the color and material of each garment.',
    'Do not invent tags to reach the count.'
  ].join('\n');
}

module.exports = {
  buildPass1System,
  buildPass1Prompt
};
