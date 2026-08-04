let sdk = null;
let loadError = null;

function isEnabled() {
  return Boolean(process.env.USAGI_HUB_URL);
}

function getSdk() {
  if (sdk || loadError || !isEnabled()) {
    return sdk;
  }
  try {
    sdk = require(process.env.USAGI_SDK_PATH);
  } catch (error) {
    loadError = error;
  }
  return sdk;
}

function recordToTagList({ naturalLanguage, loraInput, modelTranslate, mode }, result) {
  return {
    schema: 'tag-list@1',
    input: {
      naturalLanguage,
      loraInput: loraInput || '',
      modelTranslate: modelTranslate || '',
      mode: mode || 'strict'
    },
    output: {
      positiveTags: (result.final && result.final.positiveTags) || [],
      negativeTags: (result.final && result.final.negativeTags) || [],
      globalPositiveText: (result.final && result.final.globalPositiveText) || '',
      globalNegativeText: (result.final && result.final.globalNegativeText) || '',
      finalText: (result.final && result.final.finalText) || ''
    }
  };
}

async function signalReady() {
  const client = getSdk();
  if (!client) {
    return null;
  }
  return client.ready();
}

async function emitRunRecord(req, result) {
  const client = getSdk();
  if (!client) {
    return null;
  }
  const { input, output } = recordToTagList(req.body || {}, result);
  return client.record('tag-list@1', { input, output });
}

module.exports = { isEnabled, signalReady, emitRunRecord, recordToTagList };
