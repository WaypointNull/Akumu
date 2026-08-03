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

function buildGlobalSystem() {
  return [
    'You convert natural language into one global booru-style prompt line.',
    'Output only comma-separated tags with no prose.',
    'Keep focus on global scene composition and subject count.',
    'Always include masterpiece, best_quality, amazing_quality, absurdres.'
  ].join(' ');
}

function buildGlobalPrompt(naturalLanguage) {
  return [`Request: ${naturalLanguage}`, 'Return one line of tags for GLOBAL_POSITIVE only.'].join('\n');
}

function buildRegionalSystem() {
  return [
    'Create regional booru tag prompts for RGB regional prompting.',
    'Output exactly these lines and nothing else:',
    'RED: ...',
    'GREEN: ...',
    'BLUE: ...',
    'GLOBAL_NEGATIVE: ...',
    'Use comma-separated tags only, no prose.'
  ].join(' ');
}

function buildRegionalPrompt(naturalLanguage, globalPrompt) {
  return [
    `Request: ${naturalLanguage}`,
    `Global positive: ${globalPrompt}`,
    'If there are 2 characters, fill RED and GREEN and keep BLUE empty.',
    'If there are 3+ characters, fill RED, GREEN, and BLUE.',
    'GLOBAL_NEGATIVE must include: bad_quality, worst_quality, worst_detail, sketch, bad_hands, bad_anatomy, deformed, artist_name, watermark, signature, patreon, twitter_username.'
  ].join('\n');
}

function buildMaskPoseSystem() {
  return [
    'Create a mask-only pose prompt for RGB silhouette mask generation.',
    'Output comma-separated tags only with no prose.',
    'Focus only on: subject count, relative placement, pose/action, view angle.',
    'Do not include style, clothing, facial details, identity details, or quality tags.',
    'Use extremely simple silhouette language: stickman, bathroom_sign_figure, plain_shape, no_features.'
  ].join(' ');
}

function buildMaskPosePrompt(naturalLanguage, globalPrompt) {
  return [
    `Natural request: ${naturalLanguage}`,
    `Global prompt context: ${globalPrompt}`,
    'Return one short comma-separated line for mask generation only.'
  ].join('\n');
}

const MASK_POSE_BASE_TAGS = [
  'rgb_mask',
  'black_background',
  'stickman_silhouette',
  'bathroom_sign_figure',
  'plain_shape',
  'no_features',
  'full_body',
  'flat_color',
  'hard_edges'
];

module.exports = {
  buildPass1System,
  buildPass1Prompt,
  buildGlobalSystem,
  buildGlobalPrompt,
  buildRegionalSystem,
  buildRegionalPrompt,
  buildMaskPoseSystem,
  buildMaskPosePrompt,
  MASK_POSE_BASE_TAGS
};
