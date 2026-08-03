<script setup>
import { ref, onMounted } from 'vue';

const emit = defineEmits(['change']);

defineProps({
  width: { type: Number, default: 512 },
  height: { type: Number, default: 512 }
});

const canvasRef = ref(null);
const drawing = ref(false);
const last = ref(null);
const undoStack = ref([]);
const canUndo = ref(false);

let ctx = null;

function setup() {
  const canvas = canvasRef.value;
  ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  snapshot();
  emitChange();
}

function point(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvasRef.value.width) / rect.width,
    y: ((e.clientY - rect.top) * canvasRef.value.height) / rect.height
  };
}

function snapshot() {
  if (undoStack.value.length >= 40) {
    undoStack.value.shift();
  }
  undoStack.value.push(canvasRef.value.toDataURL('image/png'));
  canUndo.value = undoStack.value.length > 1;
}

function emitChange() {
  emit('change', canvasRef.value.toDataURL('image/png'));
}

function restore(dataUrl) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    ctx.drawImage(img, 0, 0);
    canUndo.value = undoStack.value.length > 1;
    emitChange();
  };
  img.src = dataUrl;
}

function undo() {
  if (undoStack.value.length <= 1) {
    return;
  }
  undoStack.value.pop();
  restore(undoStack.value[undoStack.value.length - 1]);
}

function clearCanvas() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  undoStack.value = [];
  snapshot();
  canUndo.value = false;
  emitChange();
}

function onPointerDown(e) {
  e.preventDefault();
  canvasRef.value.setPointerCapture(e.pointerId);
  drawing.value = true;
  last.value = point(e);
  ctx.beginPath();
  ctx.moveTo(last.value.x, last.value.y);
}

function onPointerMove(e) {
  if (!drawing.value) {
    return;
  }
  e.preventDefault();
  const p = point(e);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last.value = p;
}

function onPointerUp(e) {
  if (!drawing.value) {
    return;
  }
  drawing.value = false;
  canvasRef.value.releasePointerCapture(e.pointerId);
  snapshot();
  emitChange();
}

onMounted(setup);
</script>

<template>
  <div>
    <div class="sketch-canvas-wrap">
      <canvas
        ref="canvasRef"
        :width="width"
        :height="height"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      ></canvas>
    </div>
    <div class="row">
      <button type="button" class="outlined small" :disabled="!canUndo" @click="undo">Undo</button>
      <button type="button" class="outlined small" @click="clearCanvas">Clear</button>
    </div>
  </div>
</template>
