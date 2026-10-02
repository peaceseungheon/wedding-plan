import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 127.0.0.1로 dev 서버에 접근하면 Next 16이 dev 리소스(HMR/Flight)를
  // cross-origin으로 차단해 하이드레이션이 실패한다. localhost(::1)가 다른
  // 개발 서버로 점유된 환경을 위해 loopback IP를 허용한다.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
