/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The legacy app lived on `?symbol=` and `?view=&sub=` query URLs. Those
  // links are rewritten to real routes in `src/middleware.ts`, so a link
  // somebody saved from the old build still lands on the same page.
};

export default nextConfig;
