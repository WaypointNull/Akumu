const { canonicalizeConcepts } = require('../canonicalize/service');

async function apply(
  records,
  pending,
  naturalLanguage,
  { model, enabled = false, canonicalizer = canonicalizeConcepts } = {},
  deps
) {
  if (!enabled || !pending.length || !model) {
    return records;
  }

  try {
    const resolvedTags = records
      .filter((r) => r.status === 'kept' || r.status === 'alias' || r.status === 'retrieved')
      .map((r) => r.tag);
    const result = await canonicalizer(
      {
        request: naturalLanguage,
        resolvedTags,
        concepts: pending,
        model
      },
      deps
    );
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

  return records;
}

module.exports = { apply };
