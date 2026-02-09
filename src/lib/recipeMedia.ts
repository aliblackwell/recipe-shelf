import { readdir } from "node:fs/promises";
import path from "node:path";

type MediaKind = "image" | "video";

export type RecipeMedia = {
  url: string;
  kind: MediaKind;
  filename: string;
};

type IndexedMedia = {
  stem: string;
  order: number | null;
  url: string;
  kind: MediaKind;
  filename: string;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const VIDEO_EXTENSIONS = new Set([".webm", ".mp4", ".mov", ".m4v"]);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

let mediaIndexPromise: Promise<IndexedMedia[]> | null = null;

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPublicUrl = (relativePath: string): string => {
  const normalized = relativePath.split(path.sep).join("/");
  return `/${encodeURI(normalized).replace(/%2F/g, "/")}`;
};

const createEntry = (relativePath: string): IndexedMedia | null => {
  const extension = path.extname(relativePath).toLowerCase();
  const kind: MediaKind | null = IMAGE_EXTENSIONS.has(extension)
    ? "image"
    : VIDEO_EXTENSIONS.has(extension)
      ? "video"
      : null;

  if (!kind) return null;

  const filename = path.basename(relativePath);
  const stem = filename.slice(0, -extension.length);
  const match = stem.match(/^(.*?)(?:-(\d+))?$/);
  if (!match) return null;

  return {
    stem: match[1].toLowerCase(),
    order: match[2] ? Number.parseInt(match[2], 10) : null,
    url: toPublicUrl(relativePath),
    kind,
    filename,
  };
};

const walkPublicDirectory = async (directory: string, prefix = ""): Promise<IndexedMedia[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const collected: IndexedMedia[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collected.push(...(await walkPublicDirectory(fullPath, relativePath)));
      continue;
    }

    const media = createEntry(relativePath);
    if (media) collected.push(media);
  }

  return collected;
};

const getMediaIndex = async (): Promise<IndexedMedia[]> => {
  if (!mediaIndexPromise) {
    mediaIndexPromise = walkPublicDirectory(PUBLIC_DIR).catch(() => []);
  }
  return mediaIndexPromise;
};

export const getRecipeMedia = async (recipeSlug: string): Promise<RecipeMedia[]> => {
  const allMedia = await getMediaIndex();
  const slug = recipeSlug.toLowerCase();
  const slugPattern = new RegExp(`^${escapeRegex(slug)}(?:-(\\d+))?$`);

  return allMedia
    .filter((media) => slugPattern.test(media.stem))
    .sort((a, b) => {
      if (a.order === null && b.order !== null) return -1;
      if (a.order !== null && b.order === null) return 1;
      if (a.order !== null && b.order !== null) return a.order - b.order;
      return a.filename.localeCompare(b.filename);
    })
    .map(({ url, kind, filename }) => ({ url, kind, filename }));
};
