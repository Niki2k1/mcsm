<template>
  <UContainer>
    <UPage>
      <UPageHeader title="Create Server">
        <template #description>
          <div class="flex flex-col gap-2">
            <UProgress
              :max="['Choose Type', 'Details', 'Server Properties', 'Review']"
              :value="step"
              :ui="{ step: { align: 'text-left' } }"
            />

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
              </div>
            </div>
          </div>
        </template>
      </UPageHeader>
      <UPageBody class="flex flex-col gap-4">
        <component :is="stepComponents[step]" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<script lang="ts" setup>
const step = ref(0);

const stepComponents = [
  resolveComponent("ServerStepsType"),
  resolveComponent("ServerStepsDetails"),
  resolveComponent("ServerStepsServerProperties"),
  resolveComponent("ServerStepsReview"),
];

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
