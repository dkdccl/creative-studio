/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // DALL-E が返す一時 URL を <Image> で表示するため
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      // Supabase Storage に保存した画像
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default nextConfig;
