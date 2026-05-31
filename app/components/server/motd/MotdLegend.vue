<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      icon="i-heroicons-swatch"
      label="§ codes"
    />

    <template #content>
      <div class="w-72 p-3 space-y-3">
        <div>
          <p class="text-xs font-medium text-muted mb-2">Colors</p>
          <div class="grid grid-cols-2 gap-1">
            <div
              v-for="color in colors"
              :key="color.code"
              class="flex items-center gap-2 text-xs"
            >
              <span
                class="size-4 rounded-sm ring-1 ring-inset ring-white/10 shrink-0"
                :style="{ backgroundColor: color.hex }"
              />
              <span class="font-mono text-muted">§{{ color.code }}</span>
              <span class="truncate text-default">{{ color.name }}</span>
            </div>
          </div>
        </div>

        <USeparator />

        <div>
          <p class="text-xs font-medium text-muted mb-2">Formatting</p>
          <div class="grid grid-cols-2 gap-1">
            <div
              v-for="format in formats"
              :key="format.code"
              class="flex items-center gap-2 text-xs"
            >
              <UIcon :name="format.icon" class="size-4 text-muted shrink-0" />
              <span class="font-mono text-muted">§{{ format.code }}</span>
              <span class="truncate text-default">{{ format.name }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs">
              <UIcon
                name="i-heroicons-arrow-uturn-left"
                class="size-4 text-muted shrink-0"
              />
              <span class="font-mono text-muted">§r</span>
              <span class="truncate text-default">Reset</span>
            </div>
          </div>
        </div>

        <USeparator />

        <div class="flex items-start gap-2 text-xs">
          <span
            class="mt-0.5 size-4 shrink-0 rounded-sm ring-1 ring-inset ring-white/10"
            style="background: linear-gradient(135deg, #ff5733, #33a1ff)"
          />
          <span class="text-default">
            Custom hex colors
            <span class="text-muted">(1.16+)</span>
            <span class="block text-dimmed font-mono">§x§R§R§G§G§B§B</span>
          </span>
        </div>

        <p class="text-[11px] leading-snug text-dimmed">
          Use the toolbar or select text to format. Codes are saved as
          <span class="font-mono">§</span>-sequences automatically.
        </p>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { MOTD_COLORS, MOTD_FORMATS } from "~/utils/motd";

const colors = MOTD_COLORS;
const formats = MOTD_FORMATS;
</script>
