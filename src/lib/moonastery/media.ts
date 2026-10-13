const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const uploadedImagePath = new RegExp(`^${uuid}/${uuid}\\.(?:png|jpg|webp)$`);

export function isUploadedInstructionImageUrl(url: string, supabaseUrl?: string) {
  if (!supabaseUrl) return false;
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/moon-content/`;
  return url.startsWith(prefix) && uploadedImagePath.test(url.slice(prefix.length));
}
