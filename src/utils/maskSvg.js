function buildComfyMaskPrompt(maskPosePrompt, naturalLanguage) {
  return [
    'rgb mask, black background, stickman silhouette, bathroom sign figure, geometric body, no features, no face',
    maskPosePrompt,
    naturalLanguage,
    'three channel subjects only, red subject rgb(255,0,0), green subject rgb(0,255,0), blue subject rgb(0,0,255)',
    'full body silhouettes, clean hard edges, separated subjects, center composition, no internal detail, no clothing detail'
  ].join(', ');
}

function generateSimpleRgbMaskDataUri({ width = 1024, height = 1024, channels = [] }) {
  const safeWidth = Math.max(256, Math.min(2048, Number(width) || 1024));
  const safeHeight = Math.max(256, Math.min(2048, Number(height) || 1024));

  const active = channels.filter((channel) => channel && channel.enabled);
  const slots = getSlotPositions(active.length, safeWidth, safeHeight);

  const silhouettes = active
    .map((channel, index) => createSilhouetteSvg(slots[index], channel.color, safeWidth, safeHeight))
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect x="0" y="0" width="${safeWidth}" height="${safeHeight}" fill="#000000"/>
  ${silhouettes}
</svg>`;

  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function getSlotPositions(count, width, height) {
  if (count <= 1) {
    return [{ x: width * 0.5, y: height * 0.58, scale: 1 }];
  }
  if (count === 2) {
    return [
      { x: width * 0.33, y: height * 0.58, scale: 0.95 },
      { x: width * 0.67, y: height * 0.58, scale: 0.95 }
    ];
  }
  return [
    { x: width * 0.25, y: height * 0.62, scale: 0.9 },
    { x: width * 0.75, y: height * 0.62, scale: 0.9 },
    { x: width * 0.5, y: height * 0.44, scale: 0.85 }
  ];
}

function createSilhouetteSvg(slot, color, width, height) {
  const unit = Math.min(width, height);
  const scale = slot.scale || 1;
  const headRadius = unit * 0.07 * scale;
  const bodyWidth = unit * 0.18 * scale;
  const bodyHeight = unit * 0.34 * scale;

  const cx = slot.x;
  const bodyTop = slot.y - bodyHeight * 0.3;
  const bodyLeft = cx - bodyWidth / 2;
  const headCy = bodyTop - headRadius * 0.75;
  const rx = bodyWidth * 0.28;

  return `<g fill="${color}">
    <circle cx="${cx}" cy="${headCy}" r="${headRadius}"/>
    <rect x="${bodyLeft}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" rx="${rx}" ry="${rx}"/>
  </g>`;
}

module.exports = {
  buildComfyMaskPrompt,
  generateSimpleRgbMaskDataUri,
  getSlotPositions,
  createSilhouetteSvg
};
