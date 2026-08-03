function buildPass1System() {
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

function buildPass1Prompt(naturalLanguage) {
  return [
    `Request: ${naturalLanguage}`,
    'Return approximately 20-60 comma-separated tags.',
    'Do not invent tags to reach a target count.'
  ].join('\n');
}

module.exports = {
  buildPass1System,
  buildPass1Prompt
};
