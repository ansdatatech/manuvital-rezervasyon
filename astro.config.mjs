import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel'; // /serverless uzantısını sildik!

export default defineConfig({
  output: 'server',
  adapter: vercel()
});