<template>
  <UContainer>
    <UPage>
      <UPageHeader title="Create Server">
        <template #description>
          <UProgress
            :max="['Choose Type', 'Details', 'Settings', 'Review']"
            :value="step"
            :ui="{ step: { align: 'text-left' } }"
          />
        </template>
      </UPageHeader>
      <UPageBody class="flex flex-col gap-4">
        <component :is="stepComponents[step]" v-model:form="form" />

        <hr class="border-gray-200 dark:border-gray-800 my-4" />

        <div class="flex justify-between">
          <div>
            <UButton
              icon="i-heroicons-arrow-left-20-solid"
              v-if="step > 0"
              @click="prevStep"
            >
              Back
            </UButton>
          </div>
          <div>
            <UButton
              icon="i-heroicons-arrow-right-20-solid"
              v-if="step < 3"
              @click="nextStep"
            >
              Next
            </UButton>
            <UButton v-else> Create </UButton>
          </div>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<script lang="ts" setup>
import Type from "~/components/server/steps/Type.vue";
import Details from "~/components/server/steps/Details.vue";
import ServerProperties from "~/components/server/steps/ServerProperties.vue";

const step = ref(0);

const stepComponents = [Type, Details, ServerProperties];

const form = ref<Record<string, string | null>>({
  type: null,
  flavor: null,
  name: null,
  domain: null,
  version: null,
  memory: null,
  difficulty: "normal",
});

function nextStep() {
  if (step.value < 3) {
    step.value++;
  }
}

function prevStep() {
  if (step.value > 0) {
    step.value--;
  }
}
</script>

<style></style>
