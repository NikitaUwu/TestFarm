import type { NextConfig } from 'next';
import {withWorkflow} from 'workflow/next';
const config: NextConfig = {
  // Vercel's adapter packages functions; standalone is required only by Docker.
  // Next.js 16.3 cannot combine the adapter with standalone tracing (#96646).
  poweredByHeader: false,
  agentRules: false,
};
export default withWorkflow(config);
