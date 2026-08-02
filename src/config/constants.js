const path = require('path');

const PORT = 5177;
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const COMFY_DEFAULT_URL = 'http://127.0.0.1:8188';

const TAG_LIST_URL =
  'https://raw.githubusercontent.com/DraconicDragon/dbr-e621-lists-archive/refs/heads/main/tag-lists/danbooru_e621_merged/danbooru_e621_merged_2026-04-01_pt20-ia-dd-ed-spc.csv';
const TAG_FILE_PATH = path.join(__dirname, '..', '..', 'data', 'danbooru-tags.txt');

const REQUIRED_POSITIVE = ['masterpiece', 'best_quality', 'amazing_quality', 'absurdres'];
const REQUIRED_NEGATIVE = [
  'bad_quality',
  'worst_quality',
  'worst_detail',
  'sketch',
  'bad_hands',
  'bad_anatomy',
  'deformed',
  'artist_name',
  'watermark',
  'signature',
  'patreon',
  'twitter_username'
];

const EXTRA_NEGATIVE = [
  'lowres',
  'jpeg_artifacts',
  'blurry',
  'text',
  'logo',
  'cropped',
  'extra_digits',
  'missing_fingers',
  'fused_fingers',
  'mutation',
  'disfigured'
];

const POSITIVE_FILLER = [
  'highres',
  'ultra-detailed',
  'very_aesthetic',
  'great_atmosphere',
  'dramatic_lighting',
  'sharp_focus',
  'intricate_details',
  'rich_colors',
  'dynamic_pose',
  'perfect_composition'
];

const STYLE_BOOSTERS = new Set([
  'highres',
  'ultra-detailed',
  'very_aesthetic',
  'great_atmosphere',
  'dramatic_lighting',
  'sharp_focus',
  'intricate_details',
  'rich_colors',
  'dynamic_pose',
  'perfect_composition',
  'vibrant_colors',
  'detailed',
  'high_detail',
  'intricate',
  'concept_art',
  'masterwork',
  'newest',
  'absurdres'
]);

const JUNK_TOKENS = new Set([
  'global_positive',
  'global_negative',
  'positive',
  'negative',
  'quality_and_style',
  'character_and_franchise',
  'appearance_and_outfit',
  'pose_and_camera',
  'environment_and_lighting',
  'yes',
  'no',
  'inn',
  'ett',
  'atu',
  'ress',
  'ssi',
  'nd',
  'car',
  'mat',
  'ant',
  'x',
  'v',
  'w',
  'h',
  'ai',
  'ace',
  'king',
  'rfa',
  'kgr',
  'natu',
  'fuse',
  'lara',
  'lora',
  'n/a'
]);

const RETRIEVAL = {
  poolFloor: 0.25,
  poolLimit: 60,
  resultLimit: 20,
  gateFloor: 0.55,
  gateGapRatio: 1.25,
  stripBonus: 0.15,
  weights: { trigram: 0.3, damerau: 0.5, bm25: 0.2 },
  bm25: { k1: 1.5, b: 0.75 }
};

const DEFAULTS = {
  modelTranslate: 'qwen2.5:7b',
  modelValidate: 'qwen2.5:7b',
  modelGlobal: 'qwen2.5:7b',
  modelRegional: 'qwen2.5:7b'
};

const COMFY_DEFAULTS = {
  width: 512,
  height: 512,
  steps: 12,
  cfg: 2.5,
  sampler: 'euler',
  scheduler: 'normal',
  clipSkip: -2,
  simpleMaskDelayMs: 650
};

const FORMAT = {
  candidateCap: 120,
  validatedMin: 24,
  validatedCap: 60,
  promptTagCap: 85,
  maskPoseCap: 40
};

module.exports = {
  PORT,
  OLLAMA_URL,
  COMFY_DEFAULT_URL,
  TAG_LIST_URL,
  TAG_FILE_PATH,
  REQUIRED_POSITIVE,
  REQUIRED_NEGATIVE,
  EXTRA_NEGATIVE,
  POSITIVE_FILLER,
  STYLE_BOOSTERS,
  JUNK_TOKENS,
  RETRIEVAL,
  DEFAULTS,
  COMFY_DEFAULTS,
  FORMAT
};
