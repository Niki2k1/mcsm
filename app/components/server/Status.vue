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
          <ServerCard v-for="server in servers" :key="server.id" :server />
        </UPageGrid>
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<script setup>
import { ref } from "vue";

const servers = ref([
  {
    id: 1,
    name: "Hypixel",
    motd: "§aHypixel Network §7§c1.8/1.9/1.10/1.11/1.12 §e§lNEW PTL GAME:§b§l THE BRIDGE",
    currentPlayers: 45000,
    maxPlayers: 100000,
    ping: 23,
    status: "Online",
  },
  {
    id: 2,
    name: "Mineplex",
    motd: "Join the fun on Mineplex!",
    currentPlayers: 12000,
    maxPlayers: 50000,
    ping: 45,
    status: "Online",
  },
  {
    id: 3,
    name: "CubeCraft",
    motd: "CubeCraft Games - Unique Minecraft Mini-games",
    currentPlayers: 8000,
    maxPlayers: 20000,
    ping: 67,
    status: "Maintenance",
  },
  {
    id: 4,
    name: "The Hive",
    motd: "Buzz into The Hive for exciting games!",
    currentPlayers: 15000,
    maxPlayers: 30000,
    ping: 38,
    status: "Online",
  },
  {
    id: 5,
    name: "Wynncraft",
    motd: "The Largest MMORPG in Minecraft",
    currentPlayers: 2000,
    maxPlayers: 5000,
    ping: 89,
    status: "Offline",
  },
]);
</script>
