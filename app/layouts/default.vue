<template>
  <div>
    <Header />

    <UMain>
      <slot />
    </UMain>

    <Footer />

    <!-- Shared create wizard, opened from the header and the dashboard. -->
    <ServerFormModal />
  </div>
</template>
