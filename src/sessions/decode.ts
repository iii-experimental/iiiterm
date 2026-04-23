/**
 * Decode a Claude project-dir slug ("-Users-me-project") back into a filesystem
 * path ("/Users/me/project").  Claude encodes slashes as dashes; the decode is
 * best-effort and ambiguous when the original had dashes in a segment.
 */
export function decodeClaudeProjectSlug(slug: string): string {
  if (!slug) return slug;
  if (slug.startsWith('-')) return '/' + slug.slice(1).replace(/-/g, '/');
  return slug.replace(/-/g, '/');
}
