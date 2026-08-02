const { REQUIRED_NEGATIVE, EXTRA_NEGATIVE, DEFAULTS } = require('../../../config/constants');
const { dedupeKeepOrder } = require('../../../shared/list');
const { parseLoraInput, splitTags } = require('../../tag-resolution');
const {
  buildGlobalSystem,
  buildGlobalPrompt,
  buildRegionalSystem,
  buildRegionalPrompt,
  buildMaskPoseSystem,
  buildMaskPosePrompt,
  MASK_POSE_BASE_TAGS
} = require('../templates');
const { parseRegionalText } = require('../regionalText');
const { mergeChannelLoras } = require('../formatter');

async function generateGlobalPrompt(naturalLanguage, model, deps) {
  const selectedModel = (model || DEFAULTS.modelGlobal).trim();
  const raw = await deps.llm.ollamaGenerate(
    selectedModel,
    buildGlobalSystem(),
    buildGlobalPrompt(naturalLanguage),
    0.12
  );
  const tags = dedupeKeepOrder(splitTags(raw));
  return dedupeKeepOrder(['masterpiece', 'best_quality', 'amazing_quality', 'absurdres', ...tags]).join(', ');
}

async function generateRegionalPrompts(naturalLanguage, globalPrompt, model, channelLoras = {}, deps) {
  const selectedModel = (model || DEFAULTS.modelRegional).trim();
  const raw = await deps.llm.ollamaGenerate(
    selectedModel,
    buildRegionalSystem(),
    buildRegionalPrompt(naturalLanguage, globalPrompt),
    0.12
  );
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

async function generateMaskPosePrompt(naturalLanguage, globalPrompt, model, deps) {
  const selectedModel = (model || DEFAULTS.modelRegional).trim();
  const raw = await deps.llm.ollamaGenerate(
    selectedModel,
    buildMaskPoseSystem(),
    buildMaskPosePrompt(naturalLanguage, globalPrompt),
    0.05
  );
  const tags = dedupeKeepOrder(splitTags(raw));

  return dedupeKeepOrder([...MASK_POSE_BASE_TAGS, ...tags])
    .slice(0, 40)
    .join(', ');
}

module.exports = {
  generateGlobalPrompt,
  generateRegionalPrompts,
  generateMaskPosePrompt
};
