/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/ingest',
        destination: 'http://localhost:3001/ingest', // Proxy to Backend Ingest
      },
      {
        source: '/api/chat',
        destination: 'http://localhost:3001/chat', // Proxy to Backend Chat
      },
    ];
  },
  // You can add other Next.js specific configurations here if needed.
  // For example:
  // reactStrictMode: true,
};

export default nextConfig;
