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
import {
  allowedDirectoryCmd,
  createDirectoryCmd,
  listDirectoryCmd,
  listDirectoryTreeCmd,
} from "./lib/directoryCmds.js";
import {
  getFileMetadataCmd,
  getMultipleFilesMetadataCmd,
  writeAudioMetadataCmd,
  writeMultipleAudioMetadataCmd,
} from "./lib/metadataCmds.js";
import { expandHome, normalizePath } from "./lib/util.js";

import {
  getFileInfoCmd,
  moveFileCmd,
  searchFilesCmd,
} from "./lib/filesCmds.js";

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
  getMultipleFilesMetadataCmd(allowedDirectories),
  writeMultipleAudioMetadataCmd(allowedDirectories),
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
