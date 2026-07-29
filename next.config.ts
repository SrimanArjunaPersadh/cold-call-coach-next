import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV ONLY — no effect on the Vercel build.
  //
  // Next blocks cross-origin requests to dev resources (/_next/*, HMR) by
  // default, so opening the LAN URL on a phone served the server HTML and then
  // silently refused every dev chunk: React never hydrated and the page sat on
  // whatever the server rendered ("Checking microphone…", Record disabled).
  // The wildcard covers the whole subnet, so a new DHCP lease doesn't break it
  // again. Matched segment-wise by Next's own origin matcher.
  allowedDevOrigins: ["192.168.0.*"],
};

export default nextConfig;
