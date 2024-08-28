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
          <div
            v-for="server in servers"
            :key="server.id"
            class="rounded-lg shadow-md overflow-hidden flex dark:text-white relative"
            :class="getBorderClass(server.status)"
          >
            <div
              class="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent"
              :class="`${getStatusGradientColor(server.status)}`"
            ></div>
            <div class="flex-grow p-4 relative z-10">
              <div class="flex justify-between items-center mb-2">
                <h2 class="text-xl font-semibold flex items-center gap-2">
                  <UIcon name="i-heroicons-server-stack-20-solid" />
                  {{ server.name }}
                </h2>
                <UBadge :color="getStatusColor(server.status)" variant="soft">
                  {{ server.status }}
                </UBadge>
              </div>
              <p class="mb-2 minecraft-font">{{ server.motd }}</p>
              <div class="flex justify-between text-sm">
                <span class="flex gap-2 items-center">
                  <UIcon name="i-heroicons-users-20-solid" />
                  {{ server.currentPlayers }}/{{ server.maxPlayers }}
                </span>
                <span class="flex gap-2 items-center">
                  <UIcon name="i-tabler-wave-saw-tool" />
                  {{ server.ping }}ms
                </span>
              </div>
            </div>
          </div>
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
    motd: "Welcome to Hypixel - The Best Minecraft Server",
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

const getStatusColor = (status) => {
  switch (status.toLowerCase()) {
    case "online":
      return "green";
    case "offline":
      return "red";
    case "maintenance":
      return "yellow";
  }
};

const getStatusGradientColor = (status) => {
  switch (status.toLowerCase()) {
    case "online":
      return "from-green-500/15";
    case "offline":
      return "from-red-500/15";
    case "maintenance":
      return "from-yellow-500/15";

    default:
      return "from-gray-500/15";
  }
};

const getBorderClass = (status) => {
  switch (status.toLowerCase()) {
    case "online":
      return "border-l-4 border-green-500";
    case "offline":
      return "border-l-4 border-red-500";
    case "maintenance":
      return "border-l-4 border-yellow-500";
    default:
      return "border-l-4 border-gray-500";
  }
};
</script>

<style>
@font-face {
  font-family: "Minecraft";
  src: url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.eot");
  src: url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.eot?#iefix")
      format("embedded-opentype"),
    url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.woff2")
      format("woff2"),
    url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.woff")
      format("woff"),
    url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.ttf")
      format("truetype"),
    url("https://db.onlinewebfonts.com/t/6ab539c6fc2b21ff0b149b3d06d7f97c.svg#Minecraft")
      format("svg");
}

.minecraft-font {
  font-family: "Minecraft", sans-serif;
  font-size: 0.9rem;
  line-height: 1.2;
}
</style>
