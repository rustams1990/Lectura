import ytdlp from 'yt-dlp-exec';
import WebVTT from 'node-webvtt';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleResult {
  success: boolean;
  subtitles?: SubtitleCue[];
  error?: string;
}

/**
 * Downloads auto-generated subtitles from a YouTube video and parses them into JSON format
 * @param youtubeUrl - The YouTube video URL
 * @returns Promise<SubtitleResult> - Object containing success status, subtitles array, or error message
 */
export async function downloadAndParseYouTubeSubtitles(
  youtubeUrl: string
): Promise<SubtitleResult> {
  const tempDir = os.tmpdir();
  const vttFilePath = path.join(tempDir, `subtitles_${Date.now()}.vtt`);

  try {
    // Download auto-generated subtitles in VTT format using yt-dlp
    await ytdlp(youtubeUrl, {
      writeSub: true,
      writeAutoSub: true,
      subLang: 'en',
      subFormat: 'vtt',
      output: vttFilePath,
      skipDownload: true, // Only download subtitles, not the video
    });

    // Check if the VTT file was created
    if (!fs.existsSync(vttFilePath)) {
      return {
        success: false,
        error: 'No subtitles found for this video. Auto-generated subtitles may not be available.',
      };
    }

    // Read the VTT file content
    const vttContent = fs.readFileSync(vttFilePath, 'utf-8');

    // Parse VTT content using node-webvtt
    const parsed = WebVTT.parse(vttContent);

    if (!parsed.cues || parsed.cues.length === 0) {
      fs.unlinkSync(vttFilePath);
      return {
        success: false,
        error: 'Subtitles file is empty or could not be parsed.',
      };
    }

    // Convert cues to the desired format
    const subtitles: SubtitleCue[] = parsed.cues.map((cue) => ({
      start: cue.start,
      end: cue.end,
      text: cue.text,
    }));

    // Clean up the temporary file
    fs.unlinkSync(vttFilePath);

    return {
      success: true,
      subtitles,
    };
  } catch (error) {
    // Clean up the temporary file if it exists
    if (fs.existsSync(vttFilePath)) {
      try {
        fs.unlinkSync(vttFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Check for specific error messages related to missing subtitles
    if (
      errorMessage.includes('subtitles') ||
      errorMessage.includes('caption') ||
      errorMessage.includes('no automatic captions')
    ) {
      return {
        success: false,
        error: 'No subtitles available for this video. Auto-generated subtitles may not be available.',
      };
    }

    return {
      success: false,
      error: `Failed to download subtitles: ${errorMessage}`,
    };
  }
}

/**
 * Alternative function that tries multiple subtitle languages if English is not available
 * @param youtubeUrl - The YouTube video URL
 * @param languages - Array of language codes to try (default: ['en', 'en-US', 'en-GB'])
 * @returns Promise<SubtitleResult> - Object containing success status, subtitles array, or error message
 */
export async function downloadAndParseYouTubeSubtitlesWithFallback(
  youtubeUrl: string,
  languages: string[] = ['en', 'en-US', 'en-GB']
): Promise<SubtitleResult> {
  for (const lang of languages) {
    const result = await downloadAndParseYouTubeSubtitlesWithLang(youtubeUrl, lang);
    if (result.success) {
      return result;
    }
  }

  return {
    success: false,
    error: 'No subtitles available in any of the requested languages.',
  };
}

async function downloadAndParseYouTubeSubtitlesWithLang(
  youtubeUrl: string,
  lang: string
): Promise<SubtitleResult> {
  const tempDir = os.tmpdir();
  const vttFilePath = path.join(tempDir, `subtitles_${Date.now()}.vtt`);

  try {
    await ytdlp(youtubeUrl, {
      writeSub: true,
      writeAutoSub: true,
      subLang: lang,
      subFormat: 'vtt',
      output: vttFilePath,
      skipDownload: true,
    });

    if (!fs.existsSync(vttFilePath)) {
      return {
        success: false,
        error: 'No subtitles found for this language.',
      };
    }

    const vttContent = fs.readFileSync(vttFilePath, 'utf-8');
    const parsed = WebVTT.parse(vttContent);

    if (!parsed.cues || parsed.cues.length === 0) {
      fs.unlinkSync(vttFilePath);
      return {
        success: false,
        error: 'Subtitles file is empty or could not be parsed.',
      };
    }

    const subtitles: SubtitleCue[] = parsed.cues.map((cue) => ({
      start: cue.start,
      end: cue.end,
      text: cue.text,
    }));

    fs.unlinkSync(vttFilePath);

    return {
      success: true,
      subtitles,
    };
  } catch (error) {
    if (fs.existsSync(vttFilePath)) {
      try {
        fs.unlinkSync(vttFilePath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
