const {
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  STYLE_BOOSTERS,
  DEFAULTS
} = require('../config/constants');
const { ollamaGenerate } = require('./ollamaService');
const { getTagSet } = require('./tagListService');
const {
  parseLoraInput,
  splitTags,
  dedupeKeepOrder,
  isUsableTag,
  isSectionLabel,
  formatTagBlock
} = require('../utils/tagUtils');

async function runSinglePipeline({ naturalLanguage, loraInput = '', modelTranslate, modelValidate, modelFormat }) {
  const selectedModelTranslate = (modelTranslate || DEFAULTS.modelTranslate).trim();
  const selectedModelValidate = (modelValidate || DEFAULTS.modelValidate).trim();
  const selectedModelFormat = (modelFormat || DEFAULTS.modelFormat).trim();

  const loraTags = parseLoraInput(loraInput);

  const pass1System = [
    'Convert natural language image requests into danbooru-style tags.',
    'Output comma-separated tags only.',
    'No prose, no section labels, no bullet points, no explanations.',
    'Use lowercase and underscores.',
    'Split combined concepts into separate tags.'
  ].join(' ');

  const pass1Prompt = [`Request: ${naturalLanguage}`, 'Return 35-80 comma-separated tags.'].join('\n');

  const pass1Raw = await ollamaGenerate(selectedModelTranslate, pass1System, pass1Prompt, 0.15);
  const pass1Tags = splitTags(pass1Raw).filter((tag) => !isSectionLabel(tag));

  const candidates = buildCandidatesFromTagList(pass1Tags, naturalLanguage, getTagSet());

  const pass2System = [
    'You validate danbooru tags against an allowed tag list.',
    'Use only tags present in the allowed list.',
    'Output comma-separated tags only.',
    'No prose and no section labels.'
  ].join(' ');

  const pass2Prompt = [
    `Request: ${naturalLanguage}`,
    `Raw tags: ${pass1Tags.join(', ') || '(none)'}`,
    `Allowed tags: ${candidates.join(', ') || '(none)'}`,
    'Return 30-75 validated tags from Allowed tags only.'
  ].join('\n');

  const pass2Raw = await ollamaGenerate(selectedModelValidate, pass2System, pass2Prompt, 0.1);
  let validatedTags = splitTags(pass2Raw)
    .filter((tag) => getTagSet().has(tag))
    .filter((tag) => !isSectionLabel(tag));

  if (validatedTags.length < 24) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidates]).slice(0, 60);
  }

  const pass3System = [
    'Format final image prompts for WaiIllustrious SDXL.',
    'Output exactly these sections:',
    'GLOBAL_POSITIVE:',
    'GLOBAL_NEGATIVE:',
    'Use comma-separated tags only under each section.',
    'Do not output a separate LoRA section.',
    'No explanations.'
  ].join(' ');

  const pass3Prompt = [
    `Request: ${naturalLanguage}`,
    `Validated tags: ${validatedTags.join(', ')}`,
    `Inline LoRA tags (must stay in GLOBAL_POSITIVE): ${loraTags.join(', ') || '(none)'}`,
    `Mandatory positive tags: ${REQUIRED_POSITIVE.join(', ')}`,
    `Mandatory negative tags: ${REQUIRED_NEGATIVE.join(', ')}`,
    'Return only GLOBAL_POSITIVE and GLOBAL_NEGATIVE sections.'
  ].join('\n');

  const pass3Raw = await ollamaGenerate(selectedModelFormat, pass3System, pass3Prompt, 0.1);
  const normalized = normalizeFinalOutput(pass3Raw, pass1Tags, validatedTags, loraTags, naturalLanguage, candidates);

  return {
    models: {
      modelTranslate: selectedModelTranslate,
      modelValidate: selectedModelValidate,
      modelFormat: selectedModelFormat
    },
    passes: {
      translate: pass1Raw,
      validate: pass2Raw,
      format: pass3Raw
    },
    final: normalized
  };
}

async function generateGlobalPrompt(naturalLanguage, model) {
  const selectedModel = (model || DEFAULTS.modelGlobal).trim();
  const system = [
    'You convert natural language into one global booru-style prompt line.',
    'Output only comma-separated tags with no prose.',
    'Keep focus on global scene composition and subject count.',
    'Always include masterpiece, best_quality, amazing_quality, absurdres.'
  ].join(' ');

  const prompt = [`Request: ${naturalLanguage}`, 'Return one line of tags for GLOBAL_POSITIVE only.'].join('\n');
  const raw = await ollamaGenerate(selectedModel, system, prompt, 0.12);
  const tags = dedupeKeepOrder(splitTags(raw));
  return dedupeKeepOrder(['masterpiece', 'best_quality', 'amazing_quality', 'absurdres', ...tags]).join(', ');
}

async function generateRegionalPrompts(naturalLanguage, globalPrompt, model, channelLoras = {}) {
  const selectedModel = (model || DEFAULTS.modelRegional).trim();
  const system = [
    'Create regional booru tag prompts for RGB regional prompting.',
    'Output exactly these lines and nothing else:',
    'RED: ...',
    'GREEN: ...',
    'BLUE: ...',
    'GLOBAL_NEGATIVE: ...',
    'Use comma-separated tags only, no prose.'
  ].join(' ');

  const prompt = [
    `Request: ${naturalLanguage}`,
    `Global positive: ${globalPrompt}`,
    'If there are 2 characters, fill RED and GREEN and keep BLUE empty.',
    'If there are 3+ characters, fill RED, GREEN, and BLUE.',
    'GLOBAL_NEGATIVE must include: bad_quality, worst_quality, worst_detail, sketch, bad_hands, bad_anatomy, deformed, artist_name, watermark, signature, patreon, twitter_username.'
  ].join('\n');

  const raw = await ollamaGenerate(selectedModel, system, prompt, 0.12);
  const parsed = parseRegionalText(raw);

  const red = mergeChannelLoras(parseLoraInput(channelLoras.red || ''), splitTags(parsed.red)).join(', ');
  const green = mergeChannelLoras(parseLoraInput(channelLoras.green || ''), splitTags(parsed.green)).join(', ');
  const blue = mergeChannelLoras(parseLoraInput(channelLoras.blue || ''), splitTags(parsed.blue)).join(', ');
  const globalNegative = dedupeKeepOrder([
    ...REQUIRED_NEGATIVE,
    ...splitTags(parsed.globalNegative),
    ...EXTRA_NEGATIVE
  ]).join(', ');

  return { red, green, blue, globalNegative };
}

async function generateMaskPosePrompt(naturalLanguage, globalPrompt, model) {
  const selectedModel = (model || DEFAULTS.modelRegional).trim();
  const system = [
    'Create a mask-only pose prompt for RGB silhouette mask generation.',
    'Output comma-separated tags only with no prose.',
    'Focus only on: subject count, relative placement, pose/action, view angle.',
    'Do not include style, clothing, facial details, identity details, or quality tags.',
    'Use extremely simple silhouette language: stickman, bathroom_sign_figure, plain_shape, no_features.'
  ].join(' ');

  const prompt = [
    `Natural request: ${naturalLanguage}`,
    `Global prompt context: ${globalPrompt}`,
    'Return one short comma-separated line for mask generation only.'
  ].join('\n');

  const raw = await ollamaGenerate(selectedModel, system, prompt, 0.05);
  const tags = dedupeKeepOrder(splitTags(raw));

  const base = [
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

  return dedupeKeepOrder([...base, ...tags]).slice(0, 40).join(', ');
}

function mergeChannelLoras(channelLoraTags, channelPromptTags) {
  return dedupeKeepOrder([...(channelLoraTags || []), ...(channelPromptTags || [])]);
}

function buildCandidatesFromTagList(rawTags, naturalLanguage, allowedTags) {
  const candidates = [];
  for (const tag of rawTags) {
    if (allowedTags.has(tag)) {
      candidates.push(tag);
    }
  }

  const inferred = inferTagsFromText(naturalLanguage).filter((tag) => allowedTags.has(tag));
  return dedupeKeepOrder([...candidates, ...inferred]).filter((tag) => isUsableTag(tag)).slice(0, 120);
}

function normalizeFinalOutput(rawFormatted, pass1Tags, validatedTags, loraTags, naturalLanguage, candidates) {
  const sections = extractSections(rawFormatted);
  const inferred = inferTagsFromText(naturalLanguage);

  const rawPositive = splitTags(sections.GLOBAL_POSITIVE || '');
  let positive = dedupeKeepOrder([...pass1Tags, ...validatedTags, ...candidates, ...inferred, ...rawPositive]).slice(0, 180);
  let negative = splitTags(sections.GLOBAL_NEGATIVE || '');

  positive = dedupeKeepOrder([
    ...REQUIRED_POSITIVE,
    ...loraTags,
    ...positive.filter((tag) => !REQUIRED_NEGATIVE.includes(tag)),
    ...POSITIVE_FILLER
  ]);

  positive = positive
    .filter((tag) => tag.startsWith('<lora:') || isUsableTag(tag))
    .filter((tag) => shouldKeepPositiveTag(tag));

  if (positive.length > 85) {
    positive = positive.slice(0, 85);
  }

  negative = dedupeKeepOrder([
    ...REQUIRED_NEGATIVE,
    ...negative.filter((tag) => !REQUIRED_POSITIVE.includes(tag)),
    ...EXTRA_NEGATIVE
  ]).filter((tag) => isUsableTag(tag));

  if (negative.length > 45) {
    negative = negative.slice(0, 45);
  }

  const positiveText = formatTagBlock(positive);
  const negativeText = formatTagBlock(negative);

  return {
    positiveTags: positive,
    negativeTags: negative,
    globalPositiveText: positiveText,
    globalNegativeText: negativeText,
    finalText: `GLOBAL_POSITIVE:\n${positiveText}\n\nGLOBAL_NEGATIVE:\n${negativeText}`
  };
}

function shouldKeepPositiveTag(tag) {
  if (tag.startsWith('<lora:')) {
    return true;
  }
  if (REQUIRED_POSITIVE.includes(tag)) {
    return true;
  }
  if (STYLE_BOOSTERS.has(tag)) {
    return true;
  }
  if (tag === 'neeko_(league_of_legends)' || tag === 'league_of_legends') {
    return true;
  }
  if (tag.length <= 2) {
    return false;
  }
  if (/^\d+$/.test(tag)) {
    return false;
  }
  if (/^(no|not|and|or|the|with|for|from|into)$/.test(tag)) {
    return false;
  }
  if (/^[a-z]$/.test(tag)) {
    return false;
  }
  if (/^[a-z]{2}$/.test(tag) && !/^(on|at|in|up|of|to)$/.test(tag)) {
    return false;
  }
  return /^[a-z0-9_()'\-]+$/.test(tag);
}

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

function extractSections(text) {
  const source = text || '';
  const positiveMatch = source.match(/GLOBAL_POSITIVE\s*:\s*([\s\S]*?)(GLOBAL_NEGATIVE\s*:|$)/i);
  const negativeMatch = source.match(/GLOBAL_NEGATIVE\s*:\s*([\s\S]*)$/i);
  return {
    GLOBAL_POSITIVE: positiveMatch ? positiveMatch[1].trim() : '',
    GLOBAL_NEGATIVE: negativeMatch ? negativeMatch[1].trim() : ''
  };
}

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

module.exports = {
  runSinglePipeline,
  generateGlobalPrompt,
  generateRegionalPrompts,
  generateMaskPosePrompt
};
