import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't generate AGENTS.md / CLAUDE.md in the project root on `next dev`.
  agentRules: false,
};

export default nextConfig;
