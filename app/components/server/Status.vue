<template>
  <UContainer>
    <UPage>
      <UPageHeader
        headline="Status"
        title="Overview"
        description="Check the status of your servers."
      />
      <UPageBody>
        <UPageGrid>
          <ServerCard
            v-for="server in servers"
            :key="server.id"
            :host="server"
          />
        </UPageGrid>
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<script setup>
const { data: servers } = useFetch("/api/server");
</script>
