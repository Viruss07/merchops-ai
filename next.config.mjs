/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // The old judge-mode page is now the home page.
    return [{ source: '/demo', destination: '/', permanent: false }];
  },
};

export default nextConfig;

