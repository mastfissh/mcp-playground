import fs from "fs/promises";
import path from "path";
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

export function createDirectoryCmd(allowedDirectories) {
  return {
    name: "create_directory",
    description:
      "Create a new directory or ensure a directory exists. Can create multiple " +
      "nested directories in one operation. If the directory already exists, " +
      "this operation will succeed silently. Perfect for setting up directory " +
      "structures for projects or ensuring required paths exist. Only works within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
    }),
    run: async (data) => {
      const validPath = await validatePath(data.path, allowedDirectories);
      await fs.mkdir(validPath, { recursive: true });
      return {
        content: [
          {
            type: "text",
            text: `Successfully created directory ${data.path}`,
          },
        ],
      };
    },
  };
}

export function listDirectoryTreeCmd(allowedDirectories) {
  return {
    name: "directory_tree",
    description:
      "Get a recursive tree view of files and directories as a JSON structure. " +
      "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
      "Files have no children array, while directories always have a children array (which may be empty). " +
      "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
    inputSchema: z.object({
      path: z.string(),
    }),
    run: async (data) => {
      interface TreeEntry {
        name: string;
        type: "file" | "directory";
        children?: TreeEntry[];
      }

      async function buildTree(currentPath: string): Promise<TreeEntry[]> {
        const validPath = await validatePath(currentPath, allowedDirectories);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const result: TreeEntry[] = [];

        for (const entry of entries) {
          const entryData: TreeEntry = {
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
          };

          if (entry.isDirectory()) {
            const subPath = path.join(currentPath, entry.name);
            entryData.children = await buildTree(subPath);
          }

          result.push(entryData);
        }

        return result;
      }

      const treeData = await buildTree(data.path);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(treeData, null, 2),
          },
        ],
      };
    },
  };
}
