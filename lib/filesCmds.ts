import fs from "fs/promises";
import { z } from "zod";

import { getFileStats, searchFiles, validatePath } from "./util.js";

export function getFileInfoCmd(allowedDirectories) {
  return {
    name: "get_file_info",
    description:
      "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
      "information including size, creation time, last modified time, permissions, " +
      "and type. This tool is perfect for understanding file characteristics " +
      "without reading the actual content. Only works within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
    }),
    run: async (data) => {
      const validPath = await validatePath(data.path, allowedDirectories);
      const info = await getFileStats(validPath);
      return {
        content: [
          {
            type: "text",
            text: Object.entries(info)
              .map(([key, value]) => `${key}: ${value}`)
              .join("\n"),
          },
        ],
      };
    },
  };
}

export function searchFilesCmd(allowedDirectories) {
  return {
    name: "search_files",
    description:
      "Recursively search for files and directories matching a pattern. " +
      "Searches through all subdirectories from the starting path. The search " +
      "is case-insensitive and matches partial names. Returns full paths to all " +
      "matching items. Great for finding files when you don't know their exact location. " +
      "Only searches within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
      pattern: z.string(),
      excludePatterns: z.array(z.string()).optional().default([]),
    }),
    run: async (data) => {
      const validPath = await validatePath(data.path, allowedDirectories);
      const results = await searchFiles(
        validPath,
        data.pattern,
        data.excludePatterns,
        allowedDirectories
      );
      return {
        content: [
          {
            type: "text",
            text: results.length > 0 ? results.join("\n") : "No matches found",
          },
        ],
      };
    },
  };
}

export function moveFileCmd(allowedDirectories) {
  return {
    name: "move_file",
    description:
      "Move or rename files and directories. Can move files between directories " +
      "and rename them in a single operation. If the destination exists, the " +
      "operation will fail. Works across different directories and can be used " +
      "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
    inputSchema: z.object({
      source: z.string(),
      destination: z.string(),
    }),
    run: async (data) => {
      const validSourcePath = await validatePath(
        data.source,
        allowedDirectories
      );
      const validDestPath = await validatePath(
        data.destination,
        allowedDirectories
      );
      await fs.rename(validSourcePath, validDestPath);
      return {
        content: [
          {
            type: "text",
            text: `Successfully moved ${data.source} to ${data.destination}`,
          },
        ],
      };
    },
  };
}
