/**
 * Desktop WMS builds are published as GitHub releases by
 * `.github/workflows/wms-release.yml` (tags `wms-v*`). The Downloads page
 * reads the latest release here; results are cached for ten minutes.
 */
export const WMS_REPO = "smartportops/Universal-erp";

export type ReleaseAsset = {
  name: string;
  url: string;
  sizeBytes: number;
  platform: "windows" | "mac-arm64" | "mac-x64" | "linux" | "other";
};

export type WmsRelease = {
  version: string;
  tag: string;
  publishedAt: string | null;
  url: string;
  notes: string;
  assets: ReleaseAsset[];
};

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
};

function classify(name: string): ReleaseAsset["platform"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".exe")) return "windows";
  if (lower.endsWith(".dmg")) return lower.includes("arm64") ? "mac-arm64" : "mac-x64";
  if (lower.endsWith(".appimage")) return "linux";
  return "other";
}

export async function latestWmsRelease(): Promise<WmsRelease | null> {
  try {
    const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "aera-erp" };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${WMS_REPO}/releases?per_page=10`, { headers, next: { revalidate: 600 } });
    if (!response.ok) return null;
    const releases = (await response.json()) as GitHubRelease[];
    const release = releases.find((r) => !r.draft && r.tag_name.startsWith("wms-v") && r.assets.length > 0) ?? releases.find((r) => !r.draft && r.tag_name.startsWith("wms-v"));
    if (!release) return null;
    return {
      version: release.tag_name.replace(/^wms-v/, ""),
      tag: release.tag_name,
      publishedAt: release.published_at,
      url: release.html_url,
      notes: release.body ?? "",
      assets: release.assets
        .map((a) => ({ name: a.name, url: a.browser_download_url, sizeBytes: a.size, platform: classify(a.name) }))
        .filter((a) => a.platform !== "other"),
    };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
