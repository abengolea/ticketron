export type YoutubeVideoInfo = {
  id: string;
  title: string;
  duration: number;
  thumbnail?: string;
  uploader?: string;
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export function isValidYoutubeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    if (!YOUTUBE_HOSTS.has(url.hostname)) return false;
    if (url.hostname === 'youtu.be') return url.pathname.length > 1;
    return (
      url.pathname.startsWith('/watch') ||
      url.pathname.startsWith('/shorts/') ||
      url.pathname.startsWith('/embed/')
    );
  } catch {
    return false;
  }
}

export function sanitizeDownloadFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'audio';
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
