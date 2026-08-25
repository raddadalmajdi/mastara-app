import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // يسمح بفتح خادم التطوير من عناوين الشبكة المحلية (مثل هاتف على نفس الواي فاي)
  // بدون هذا، Turbopack يحجب طلبات HMR القادمة من IP غير localhost.
  allowedDevOrigins: ["172.20.10.3"],
};

export default nextConfig;
