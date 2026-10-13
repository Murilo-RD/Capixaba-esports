export const siteConfig = {
  name: "Moonastery E-Sports",
  description: "Competição, evolução e comunidade. Conheça a Moonastery E-Sports.",
  publicUrl: import.meta.env.VITE_PUBLIC_APP_URL || "",
};

export function siteUrl(path: string): string {
  const origin =
    siteConfig.publicUrl || (typeof window !== "undefined" ? window.location.origin : "");
  if (!origin) return path;
  return new URL(path, origin).toString();
}
