import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: {
    server: {
      watch: {
        ignored: ['**/docs/catalogo_productos_robusto_completo_corregido.json'],
      },
    },
  },
});
