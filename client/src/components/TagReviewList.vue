<script setup>
defineProps({
  items: { type: Array, default: () => [] }
});

const emit = defineEmits(['pick', 'keep', 'remove']);

function suggestionsFor(item) {
  const suggestions = [];
  for (const t of item.candidates || []) suggestions.push({ tag: t, kind: 'candidate' });
  for (const t of item.decomposed || []) suggestions.push({ tag: t, kind: 'part' });
  return suggestions;
}
</script>

<template>
  <div class="review-list">
    <div v-for="item in items" :key="item.original" class="review-item">
      <div class="review-title" :title="item.status">{{ item.original }}</div>
      <div class="review-chips">
        <span v-if="!suggestionsFor(item).length" class="muted">No candidates</span>
        <button
          v-for="s in suggestionsFor(item)"
          :key="s.tag"
          type="button"
          class="chip"
          @click="emit('pick', item.original, [s.tag])"
        >
          {{ s.kind === 'part' ? `${s.tag} (part)` : s.tag }}
        </button>
      </div>
      <div class="review-actions">
        <button type="button" class="outlined small" @click="emit('keep', item.original)">Keep Original</button>
        <button type="button" class="danger small" @click="emit('remove', item.original)">Remove</button>
      </div>
    </div>
  </div>
</template>
