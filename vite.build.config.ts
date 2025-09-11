import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    root: "src",
    build: {
        outDir: "../dist/cdn",
        lib: {
            name: "ilw-org-chart",
            entry: "ilw-org-chart.ts",
            fileName: "ilw-org-chart",
            formats: ["es"],
        },
        rollupOptions: {
            output: {
                assetFileNames: () => {
                    return "[name][extname]";
                },
            },
        },
    },
    server: {
        hmr: false,
    },
});
