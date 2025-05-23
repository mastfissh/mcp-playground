#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allowedDirectoryCmd, listDirectoryCmd } from "./lib/directoryCmds.js";
import { writeAudioMetadataCmd, getFileMetadataCmd } from "./lib/metadataCmds.js";
import {
  expandHome,
  normalizePath,
  validatePath,
  getFileStats,
  searchFiles,
} from "./lib/util.js";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]"
  );
  process.exit(1);
}

// Store allowed directories in normalized form
const allowedDirectories = args.map((dir) =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(
  args.map(async (dir) => {
    try {
      const stats = await fs.stat(expandHome(dir));
      if (!stats.isDirectory()) {
        console.error(`Error: ${dir} is not a directory`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error accessing directory ${dir}:`, error);
      process.exit(1);
    }
  })
);

const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

function getFileInfoCmd(allowedDirectories) {
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

function searchFilesCmd(allowedDirectories) {
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

function moveFileCmd(allowedDirectories) {
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

function createDirectoryCmd(allowedDirectories) {
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

function listDirectoryTreeCmd(allowedDirectories) {
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



const cmds = [
  listDirectoryCmd(allowedDirectories),
  allowedDirectoryCmd(allowedDirectories),
  getFileInfoCmd(allowedDirectories),
  searchFilesCmd(allowedDirectories),
  moveFileCmd(allowedDirectories),
  createDirectoryCmd(allowedDirectories),
  listDirectoryTreeCmd(allowedDirectories),
  writeAudioMetadataCmd(allowedDirectories),
  getFileMetadataCmd(allowedDirectories),
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = cmds.map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    inputSchema: zodToJsonSchema(cmd.inputSchema) as ToolInput,
  }));
  return {
    tools,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const tool = cmds.find((cmd) => cmd.name === name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    const parsedArgs = tool.inputSchema.safeParse(args);
    if (!parsedArgs.success) {
      throw new Error(`Invalid arguments for ${name}: ${parsedArgs.error}`);
    }
    const validArgs = parsedArgs.data;
    return tool.run(validArgs);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
