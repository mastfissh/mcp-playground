import fs from "fs/promises";
import { z } from "zod";
import { validatePath } from "./util.js";

export function listDirectoryCmd(allowedDirectories) {
  return {
    name: "list_directory",
    description:
      "Get a detailed listing of all files and directories in a specified path. " +
      "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
      "prefixes. This tool is essential for understanding directory structure and " +
      "finding specific files within a directory. Only works within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
    }),
    run: async (args: any) => {
      const validPath = await validatePath(args.path, allowedDirectories);
      const entries = await fs.readdir(validPath, { withFileTypes: true });
      const formatted = entries
        .map(
          (entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`
        )
        .join("\n");
      return {
        content: [{ type: "text", text: formatted }],
      };
    },
  };
}

export function allowedDirectoryCmd(allowedDirectories) {
  return {
    name: "list_allowed_directories",
    description:
      "Returns the list of directories that this server is allowed to access. " +
      "Use this to understand which directories are available before trying to access files.",
    inputSchema: z.object({}),
    run: async () => {
      return {
        content: [
          {
            type: "text",
            text: `Allowed directories:\n${allowedDirectories.join("\n")}`,
          },
        ],
      };
    },
  };
}
