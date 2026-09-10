export async function openUrl(url: string | URL): Promise<void> {
  window.open(String(url), "_blank", "noopener");
}
