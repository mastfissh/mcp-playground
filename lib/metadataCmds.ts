import fs from "fs/promises";
import { z } from "zod";
import path from "path";
import { validatePath } from "./util.js";

export function writeAudioMetadataCmd(allowedDirectories) {
  return {
    name: "write_audio_metadata",
    description: `Write audio tags to an audio file. Important tags are "artist", "remix", "title", and "album". 
          This tool allows you to modify the metadata of the file`,
    inputSchema: z.object({
      path: z.string(),
      tags: z.object({
        album: z.string().optional(),
        artist: z.string().optional(),
        title: z.string().optional(),
        remix: z.string().optional(),
      }),
    }),
    run: async (data) => {
      const validPath = await validatePath(data.path, allowedDirectories);
      // Write tags using ffmpeg
      const { execFile } = await import("node:child_process");
      const tags = data.tags;
      const ffmpegArgs = ["-y", "-i", validPath];

      // Add metadata arguments
      // Determine file extension for special tag mapping
      const ext = path.extname(validPath).toLowerCase();
      for (const [key, value] of Object.entries(tags)) {
        if (key === "remix") {
          if (ext === ".mp3") {
            ffmpegArgs.push("-metadata", `TIT3=${value}`);
          } else if (ext === ".flac") {
            ffmpegArgs.push("-metadata", `VERSION=${value}`);
          }
          // For other formats, skip mapping "remix"
        } else {
          ffmpegArgs.push("-metadata", `${key}=${value}`);
        }
      }

      // Output to a temporary file in a tmp subdirectory (ffmpeg does not support in-place editing)
      const tmpDir = path.join(path.dirname(validPath), "tmp");
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(tmpDir, path.basename(validPath));
      ffmpegArgs.push("-codec", "copy", tmpPath);

      // Run ffmpeg
      await new Promise<void>((resolve, reject) => {
        execFile("ffmpeg", ffmpegArgs, (error, stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve();
        });
      });

      // Replace original file with the new file
      await fs.rename(tmpPath, validPath);

      const success = true;
      if (!success) {
        throw new Error("Failed to write tags to the audio file.");
      }
      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote audio tags to ${data.path}`,
          },
        ],
      };
    },
  };
}

async function getFileMetadata(path, allowedDirectories) {
  const validPath = await validatePath(path, allowedDirectories);
  let content = "";
  // Try to get metadata using exiftool if the file is an image
  const ext = path.extname(validPath).toLowerCase();
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".tiff",
    ".bmp",
    ".webp",
    ".heic",
    ".heif",
    ".raw",
    ".cr2",
    ".nef",
    ".arw",
    ".dng",
  ];
  if (imageExtensions.includes(ext)) {
    try {
      const { execFile } = await import("node:child_process");
      const exiftoolPath = "exiftool"; // assumes exiftool is in PATH
      const execPromise = (cmd: string, args: string[]) =>
        new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          execFile(cmd, args, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
          });
        });
      const { stdout } = await execPromise(exiftoolPath, [validPath]);
      content = stdout.trim();
    } catch (err) {
      content = `Could not read metadata with exiftool: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  } else {
    // Check if it's a music file
    const musicExtensions = [
      ".mp3",
      ".flac",
      ".wav",
      ".ogg",
      ".m4a",
      ".aac",
      ".wma",
      ".alac",
      ".aiff",
      ".ape",
      ".opus",
      ".dsf",
      ".dff",
    ];
    if (musicExtensions.includes(ext)) {
      try {
        const mm = await import("music-metadata");
        const metadata = await mm.parseFile(validPath, {
          duration: true,
          skipCovers: true,
        });
        // Only include relevant metadata fields for brevity
        content = JSON.stringify(
          {
            common: metadata.common,
          },
          null,
          2
        );
      } catch (err) {
        content = `Could not read music metadata: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    } else {
      content = "No metadata extraction available for this file type.";
    }
  }
}

export function getFileMetadataCmd(allowedDirectories) {
  return {
    name: "read_file_metadata",
    description:
      "Tries to get metadata from a file, for example ID3 tags exif information. " +
      "Handles various metadata formats and provides detailed error messages " +
      "if the file cannot be read. Use this tool when you want information about " +
      "the contents of a single file. Only works within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
    }),
    run: async (data) => {
      const content = await getFileMetadata(data.path, allowedDirectories);
      return {
        content: [{ type: "text", text: content }],
      };
    },
  };
}
