const IMPLEMENTED_COMBOS = {
  sketch: ['scribble', 'lineart', 'canny'],
  none: []
};

function isSupportedCombo(source, mode) {
  if (source === 'none') {
    return true;
  }
  const modes = IMPLEMENTED_COMBOS[source];
  return Boolean(modes && modes.includes(mode));
}

function controlError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    return null;
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function buildControlImage({ source, mode, sketchImage }) {
  if (!isSupportedCombo(source, mode)) {
    throw controlError(`Control source/mode not implemented yet: ${source}/${mode}.`);
  }

  if (source === 'none') {
    return null;
  }

  if (source === 'sketch') {
    const parsed = parseImageDataUrl(sketchImage);
    if (!parsed || parsed.buffer.length === 0) {
      throw controlError('Sketch image must be a non-empty PNG/JPEG/WebP data URL.');
    }
    return parsed;
  }

  return null;
}

module.exports = {
  IMPLEMENTED_COMBOS,
  isSupportedCombo,
  parseImageDataUrl,
  buildControlImage
};
