/** @type {import('next').NextConfig} */
const nextConfig = {
  // PRD §92 / docs/api.md: cikti receiver tarafindan `/` altindan servis edilir.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // Static export'ta SSR/route handler yoktur; tum API cagrilari ayni origin'e gorecelidir.
  trailingSlash: true,
};

export default nextConfig;
