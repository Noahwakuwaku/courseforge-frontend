<script setup>
defineProps({ name: { type: String, default: 'grid' }, size: { type: [String, Number], default: 20 } })
const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  book: 'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3z M4 17h16 M8 7h8 M8 11h6',
  plus: 'M12 5v14 M5 12h14', arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6', check: 'M5 12l4 4L19 6',
  chevron: 'M9 5l7 7-7 7', down: 'M5 9l7 7 7-7', close: 'M6 6l12 12 M6 18L18 6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  leaf: 'M20 3c-10 0-17 2-17 10a7 7 0 0 0 7 7c8 0 10-7 10-17z M4 20L15 9',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  cloud: 'M7 18a5 5 0 1 1-1-9 6 6 0 0 1 12-1 5 5 0 0 1 0 10 M12 12v9 M8 16l4-4 4 4',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z M8 12l3 3 5-6',
  alert: 'M12 3L2 21h20L12 3z M12 9v5 M12 17v1',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 3 M4 16l2 3a8 8 0 0 0 13-2',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  edit: 'M15 4l5 5 M4 16l12-12a3 3 0 0 1 4 4L8 20H4v-4z',
  layers: 'M12 3L2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7v1',
  play: 'M8 4l12 8-12 8V4z',
}
</script>
<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name] || paths.grid" />
  </svg>
</template>
