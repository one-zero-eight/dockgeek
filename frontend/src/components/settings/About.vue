<template>
    <div class="mx-auto flex w-full max-w-[28rem] flex-col items-center gap-4 text-center">
        <div class="flex flex-col items-center gap-[0.35rem]">
            <img class="mb-1 h-[72px] w-[72px]" width="72" height="72" src="/icon.svg" alt="" />
            <div class="text-2xl font-bold tracking-[-0.01em]">Dockgeek</div>
            <div class="flex flex-col gap-[0.15rem] text-muted-foreground text-sm">
                <div>{{ $t("Version") }}: {{ $root.info.version }}</div>
                <div class="text-sm">{{ $t("Frontend Version") }}: {{ $root.frontendVersion }}</div>
            </div>
        </div>

        <div v-if="!$root.isFrontendBackendVersionMatched" class="w-full rounded-md border border-[#ffecb5] bg-[#fff3cd] p-4 text-[#664d03]" role="alert">
            {{ $t("Frontend Version do not match backend version!") }}
        </div>

        <a
            class="text-sm"
            href="https://github.com/one-zero-eight/dockgeek/releases"
            target="_blank"
            rel="noopener noreferrer"
        >
            {{ $t("Check Update On GitHub") }}
        </a>
    </div>
</template>
