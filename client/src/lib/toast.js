import { reactive } from 'vue';

export const toasts = reactive([]);

let nextId = 1;

export function toast(options = {}) {
  const id = nextId++;
  const item = {
    id,
    title: options.title || '',
    description: options.description || '',
    variant: options.variant || 'default',
    duration: options.duration ?? 4000
  };
  toasts.push(item);
  if (item.duration > 0) {
    setTimeout(() => {
      dismiss(id);
    }, item.duration);
  }
  return item;
}

export function dismiss(id) {
  const index = toasts.findIndex((t) => t.id === id);
  if (index !== -1) toasts.splice(index, 1);
}

export function useToast() {
  return { toast, dismiss };
}
