<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'
defineProps({ title: String, wide: Boolean })
const emit = defineEmits(['close'])
const el = ref(null)
let previous
onMounted(() => { previous = document.activeElement; el.value.showModal() })
onBeforeUnmount(() => { el.value?.close(); previous?.focus?.() })
</script>
<template>
  <Teleport to="body">
    <dialog ref="el" class="app-dialog" :class="{ wide }" aria-labelledby="dialog-title" @cancel.prevent="emit('close')" @click="e => { if (e.target === el) { const r = el.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) emit('close') } }">
      <header class="dialog-head">
        <h2 id="dialog-title">{{ title }}</h2>
        <button class="icon-button" aria-label="关闭窗口" @click="emit('close')">
          <AppIcon name="close" />
        </button>
      </header>
      <slot />
    </dialog>
  </Teleport>
</template>
