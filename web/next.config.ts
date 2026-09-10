import type { NextConfig } from 'next';
const config: NextConfig = {
  // Vercel's adapter packages functions; standalone is required only by Docker.
  // Next.js 16.3 cannot combine the adapter with standalone tracing (#96646).
  output: process.env.VERCEL === '1' ? undefined : 'standalone',
  poweredByHeader: false,
  agentRules: false,
};
export default config;
