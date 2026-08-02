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
const { resolve } = require('./tagRetrievalService');
const { canonicalizeConcepts } = require('./canonicalizeService');
const { resolveWithRules } = require('./resolutionRules');
const fs = require('fs');
const path = require('path');
const {
  parseLoraInput,
  splitTags,
  dedupeKeepOrder,
  isUsableTag,
  isSectionLabel
} = require('../utils/tagUtils');
const { formatResolutionSummary, formatFinalOutput, mergeChannelLoras } = require('../utils/formatting');
const { parseRegionalText } = require('../utils/regionalParseUtils');
const { inferTagsFromText } = require('../utils/inferTags');

const AMBIGUOUS_LOG_PATH = path.join(__dirname, '..', '..', 'data', 'ambiguous-log.ndjson');

const KNOWN_PROMPT_TAGS = new Set([
  ...REQUIRED_POSITIVE,
  ...REQUIRED_NEGATIVE,
  ...EXTRA_NEGATIVE,
  ...POSITIVE_FILLER,
  ...STYLE_BOOSTERS
]);

function appendAmbiguousLog(entry) {
  try {
    fs.appendFileSync(AMBIGUOUS_LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn('[ambiguous] failed to write log:', error.message);
  }
}

async function resolvePipelineTags(rawTags, naturalLanguage, { modelCanonicalize, enableCanonicalize = false } = {}) {
  const records = [];
  const pending = [];
  for (const original of rawTags) {
    if (KNOWN_PROMPT_TAGS.has(original)) {
      records.push({ original, tag: original, status: 'kept', action: 'kept' });
      continue;
    }
    let r;
    try {
      r = resolve(original);
    } catch (error) {
      console.warn(`[resolve] error for "${original}":`, error.message);
      r = { status: 'unknown', tag: original, candidates: [] };
    }

    if (r.status === 'exact') {
      records.push({ original, tag: r.tag, status: 'kept', action: 'kept' });
    } else if (r.status === 'alias') {
      records.push({ original, tag: r.tag, status: 'alias', action: 'alias' });
    } else if (r.status === 'retrieved') {
      records.push({
        original,
        tag: r.tag,
        status: 'retrieved',
        action: 'auto_replaced',
        confidence: r.confidence,
        margin: r.margin,
        candidates: r.candidates
      });
    } else {
      const rule = resolveWithRules(original);
      if (rule) {
        records.push({
          original,
          tag: rule.tag,
          extraTags: rule.extraTags,
          status: 'rule',
          action: 'rule'
        });
        console.warn(`[rule] "${original}" -> ${[rule.tag, ...(rule.extraTags || [])].join(', ')}`);
      } else if (r.candidates && r.candidates.length) {
        const pendingIndex = pending.length;
        records.push({ original, tag: original, status: 'ambiguous', action: 'ambiguous', candidates: r.candidates, pendingIndex });
        pending.push({ index: pendingIndex, original, candidates: r.candidates });
        const entry = {
          ts: new Date().toISOString(),
          request: naturalLanguage,
          input: original,
          candidates: r.candidates.slice(0, 10).map((c) => ({
            tag: c.tag,
            score: +c.score.toFixed(3),
            stripMatch: !!c.stripMatch
          }))
        };
        appendAmbiguousLog(entry);
        console.warn(
          `[ambiguous] "${original}" (request: "${naturalLanguage}") -> ${entry.candidates
            .slice(0, 5)
            .map((c) => `${c.tag}(${c.score})`)
            .join(', ')} ...`
        );
      } else {
        records.push({ original, tag: original, status: 'unknown', action: 'kept' });
      }
    }
  }

  if (enableCanonicalize && pending.length && modelCanonicalize) {
    try {
      const resolvedTags = records
        .filter((r) => r.status === 'kept' || r.status === 'alias' || r.status === 'retrieved')
        .map((r) => r.tag);
      const result = await canonicalizeConcepts({
        request: naturalLanguage,
        resolvedTags,
        concepts: pending,
        model: modelCanonicalize
      });
      for (const concept of result.concepts) {
        const record = records.find((r) => r.pendingIndex === concept.index);
        if (!record) continue;
        if (concept.status === 'resolved') {
          record.tag = concept.accepted[0].tag;
          record.extraTags = concept.accepted.slice(1).map((a) => a.tag);
          record.status = 'canonicalized';
          record.action = 'canonicalized';
          record.proposed = concept.proposed;
          record.rejected = concept.rejected;
          console.warn(
            `[phase-c] canonicalized "${record.original}" -> ${[record.tag, ...(record.extraTags || [])].join(', ')}`
          );
        } else {
          console.warn(`[phase-c] unresolved after canonicalization: "${record.original}" (SKIP/no output)`);
        }
      }
    } catch (error) {
      console.warn('[phase-c] canonicalization failed:', error.message);
    }
  }
  return records;
}

async function runSinglePipeline({ naturalLanguage, loraInput = '', modelTranslate, modelValidate }) {
  const selectedModelTranslate = (modelTranslate || DEFAULTS.modelTranslate).trim();
  const selectedModelValidate = (modelValidate || DEFAULTS.modelValidate).trim();

  const pass1System = [
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

  const pass1Prompt = [
    `Request: ${naturalLanguage}`,
    'Return approximately 20-60 comma-separated tags.',
    'Do not invent tags to reach a target count.'
  ].join('\n');

  const pass1Raw = await ollamaGenerate(selectedModelTranslate, pass1System, pass1Prompt, 0.15);
  const pass1Tags = splitTags(pass1Raw).filter((tag) => !isSectionLabel(tag));

  const candidates = buildCandidatesFromTagList(pass1Tags, naturalLanguage, getTagSet());

  const resolution = await resolvePipelineTags(pass1Tags, naturalLanguage, {
    modelCanonicalize: selectedModelValidate
  });
  const pass2Summary = formatResolutionSummary(resolution);
  let validatedTags = dedupeKeepOrder(
    resolution
      .flatMap((r) => [r.tag, ...(r.extraTags || [])])
      .filter((tag) => getTagSet().has(tag))
      .filter((tag) => !isSectionLabel(tag))
      .filter((tag) => isUsableTag(tag))
  );

  if (validatedTags.length < 24) {
    validatedTags = dedupeKeepOrder([...validatedTags, ...candidates]).slice(0, 60);
  }

  const promptTags = dedupeKeepOrder([
    ...validatedTags,
    ...candidates,
    ...inferTagsFromText(naturalLanguage)
  ])
    .filter((tag) => isUsableTag(tag))
    .slice(0, 85);

  const formatted = formatFinalOutput({ promptTags, loraInput });

  return {
    models: {
      modelTranslate: selectedModelTranslate,
      modelValidate: selectedModelValidate,
      modelFormat: null
    },
    passes: {
      translate: pass1Raw,
      validate: pass2Summary,
      format: '[deterministic] boilerplate formatter applied (no LLM)'
    },
    final: formatted
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

module.exports = {
  runSinglePipeline,
  generateGlobalPrompt,
  generateRegionalPrompts,
  generateMaskPosePrompt,
  resolvePipelineTags,
  formatResolutionSummary
};
