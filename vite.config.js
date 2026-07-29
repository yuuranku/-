import { defineConfig } from 'vite';

const isArchiveWorkflowSharedModule = (id) => [
  '/src/archive-data.js',
  '/src/archive-workflow/editor-document.js',
  '/src/archive-workflow/official-archive-source.js',
  '/src/archive-workflow/templates.js',
].some((modulePath) => id.endsWith(modulePath));

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return isArchiveWorkflowSharedModule(id) ? 'archive-workflow-shared' : undefined;
        },
      },
    },
  },
});
