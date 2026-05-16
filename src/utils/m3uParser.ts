/**
 * Parses an M3U/M3U8 text string and returns an array of file paths.
 */
export function parseM3U(m3uText: string): string[] {
  const lines = m3uText.split(/\r?\n/);
  const paths: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Ignore standard M3U comments. #EXTINF could be parsed here if we wanted metadata.
    if (trimmed.startsWith('#')) {
      continue;
    }
    
    paths.push(trimmed);
  }

  return paths;
}

/**
 * Generates a valid M3U string from an array of file names or paths.
 */
export function generateM3U(paths: string[]): string {
  let m3u = '#EXTM3U\n';
  
  for (const path of paths) {
    m3u += `${path}\n`;
  }
  
  return m3u;
}
