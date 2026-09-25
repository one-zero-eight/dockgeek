<template>
    <router-view />
    <Toaster position="bottom-right" close-button rich-colors />
</template>

<script setup>
import { Toaster } from "vue-sonner";
</script>
