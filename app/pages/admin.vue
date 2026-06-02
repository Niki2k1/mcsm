<template>
  <UContainer class="py-8 space-y-8">
    <div>
      <h1 class="text-2xl font-bold">Admin</h1>
      <p class="text-muted">
        Global settings shared across every server.
      </p>
    </div>

    <AdminStatusPanel />
    <AdminUsersPanel />
    <AdminSecretsPanel />
    <AdminDomainsPanel />
    <AdminMaintenancePanel />
  </UContainer>
</template>

<script setup lang="ts">
useSeoMeta({ title: "Admin · Minecraft Server Manager" });
</script>
