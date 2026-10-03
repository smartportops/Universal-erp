import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "unpdf"],
  devIndicators: false,
};

export default nextConfig;
