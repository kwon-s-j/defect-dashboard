import type { NextConfig } from "next";

// GitHub Pages(정적 호스팅) 전용: 서버 기능(API Route/ISR/Server Action) 미사용.
// 프로젝트 사이트는 /<repo> 하위 경로로 서빙되므로 배포 시 NEXT_PUBLIC_BASE_PATH 로 지정한다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
