<template>
  <div
    class="rounded-lg shadow-md overflow-hidden flex dark:text-white relative ring-1 ring-gray-200 dark:ring-gray-800"
    :class="getBorderClass(server.status)"
  >
    <div
      class="absolute inset-y-0 left-0 w-36 bg-gradient-to-r to-transparent"
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
      <p
        class="mb-2 font-[Minecraft] text-sm"
        v-html="motdParser(server.motd)"
      />
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
</template>

<script lang="ts" setup>
defineProps<{
  server: {
    name: string;
    motd: string;
    currentPlayers: number;
    maxPlayers: number;
    ping: number;
    status: string;
  };
}>();

const motdParser = useMotdParser();

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "online":
      return "green";
    case "offline":
      return "red";
    case "maintenance":
      return "yellow";
  }
};

const getStatusGradientColor = (status: string) => {
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

const getBorderClass = (status: string) => {
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
