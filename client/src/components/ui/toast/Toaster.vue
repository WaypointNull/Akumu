<script setup>
import { toasts } from '@/lib/toast';
import Toast from './Toast.vue';
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
    <Toast v-for="t in toasts" :key="t.id" :toast="t" />
  </div>
</template>
