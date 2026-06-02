<!-- Full-screen shell for the auth pages: interactive grid background with a
     centered glass card. -->
<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
  >
    <div
      class="pointer-events-auto absolute inset-0 z-0 flex items-center justify-center [mask-image:radial-gradient(circle_at_center,white,transparent_70%)]"
    >
      <InteractiveGridPattern
        :width="60"
        :height="60"
        :squares="[40, 40]"
        squares-class="stroke-gray-400/20 dark:stroke-gray-600/30"
      />
    </div>

    <UCard
      class="relative z-10 w-full border-default/60 bg-default/80 backdrop-blur-md"
      :class="wide ? 'max-w-md' : 'max-w-sm'"
    >
      <div class="flex flex-col items-center gap-6 py-2">
        <img src="/favicon.png" alt="MCSM" class="size-12" />

        <div class="text-center">
          <h1 class="text-xl font-semibold text-highlighted">{{ title }}</h1>
          <p v-if="description" class="mt-1 text-sm text-muted">
            {{ description }}
          </p>
        </div>

        <slot />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  /** Slightly wider card (setup wizard has more fields). */
  wide?: boolean;
}>();
</script>
