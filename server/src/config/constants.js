const path = require('path');

const PORT = Number(process.env.AKUMU_PORT) || 5177;
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/generate`;

const TAG_CATEGORY_COPYRIGHT = 3;

// WORKAROUND: danbooru-e621 merged list has unreliable categories (e.g. "cum_on_floor" -> 0,
// "female" -> 7), so a category-based NSFW guard is not viable. Instead these content stems are
// matched against normalized tag tokens to prune explicit suggestions from retrieval results.
const NSFW_CONTENT_PREFIX_STEMS = new Set([
  'cum',
  'sperm',
  'semen',
  'ejaculat',
  'penis',
  'cock',
  'dick',
  'testicle',
  'scrotum',
  'vulva',
  'vagina',
  'pussy',
  'cunt',
  'clit',
  'dildo',
  'vibrator',
  'futa',
  'masturbat',
  'orgasm',
  'poop',
  'scat',
  'bukkake',
  'creampie',
  'gangbang',
  'blowjob',
  'handjob',
  'rimjob',
  'deepthroat',
  'porn',
  'nsfw',
  'guro',
  'squirting',
  'fuck',
  'pee',
  'fellatio'
]);

const NSFW_CONTENT_EXACT_TOKENS = new Set(['balls', 'sex']);

const TAG_LIST_URL =
  'https://raw.githubusercontent.com/DraconicDragon/dbr-e621-lists-archive/refs/heads/main/tag-lists/danbooru_e621_merged/danbooru_e621_merged_2026-04-01_pt20-ia-dd-ed-spc.csv';
// Desktop builds run from a read-only install dir, so the data folder can be redirected via env.
const TAG_FILE_PATH = process.env.AKUMU_DATA_DIR
  ? path.join(process.env.AKUMU_DATA_DIR, 'danbooru-tags.txt')
  : path.join(__dirname, '..', '..', '..', 'data', 'danbooru-tags.txt');

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
  // tokenPreserve rewards candidates that keep the input's exact tokens (e.g. "cat_on_surface" must
  // not be out-scored by "cum_on_surface", which only wins on raw trigram overlap). Weight moved from
  // bm25 since both encode token overlap; tokenPreserve is normalized to [0,1].
  weights: { trigram: 0.3, damerau: 0.5, bm25: 0.1, tokenPreserve: 0.1 },
  bm25: { k1: 1.5, b: 0.75 }
};

const DEFAULTS = {
  modelTranslate: 'qwen2.5:7b'
};

const FORMAT = {
  candidateCap: 120,
  validatedMin: 24,
  validatedCap: 60,
  promptTagCap: 85
};

// WORKAROUND: LLM runaway loops produce invented mega-compounds ("motorcycle_brake_fluid_thermal_...")
// that are never in the DB. Real series titles can legitimately exceed this, but they exact-match, so
// the cap only fires for tags that did NOT resolve to a known DB entry.
const SANITY = {
  maxUnderscores: 7
};

module.exports = {
  PORT,
  OLLAMA_BASE_URL,
  OLLAMA_URL,
  TAG_CATEGORY_COPYRIGHT,
  NSFW_CONTENT_PREFIX_STEMS,
  NSFW_CONTENT_EXACT_TOKENS,
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
  FORMAT,
  SANITY
};
