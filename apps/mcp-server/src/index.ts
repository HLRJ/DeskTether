#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

void serveStdio(() => createServer());
console.error("DeskTether MCP server running over stdio.");
