/** @type {import("next").NextConfig} */
const nextConfig = {
  /* Dev only: next dev compiles routes on demand then disposes them. With ~18
     routes that means constant recompiling — keep them in memory instead. */
  onDemandEntries: { maxInactiveAge: 1000 * 60 * 60, pagesBufferLength: 25 }
};
export default nextConfig;
