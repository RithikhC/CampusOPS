import type { MetadataRoute } from "next";

/** Lets students and guards add the app to their home screen, no app store needed. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NightPass",
    short_name: "NightPass",
    description: "Campus night attendance",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1e",
    theme_color: "#0a0f1e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
