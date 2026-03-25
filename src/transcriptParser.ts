import * as fs from 'fs';
import * as path from 'path';
import {
  TranscriptMessage,
  ParsedMessage,
  ParsedConversation,
  ToolCallInfo,
  TranscriptFileInfo,
} from './types';

/**
 * Extract user query from user message text.
 * Cursor wraps the actual query in <user_query> tags.
 */
function extractUserQuery(text: string): string {
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

/**
 * Detect if assistant text is an internal thinking block
 * (Cursor sometimes emits raw thinking as a separate assistant turn
 * before the real response).
 */
function looksLikeThinking(text: string): boolean {
  const trimmed = text.trim();
  const thinkingPrefixes = [
    'The user wants',
    'The user is asking',
    'Let me ',
    "I need to ",
    "I'll ",
    "I should ",
    'Looking at',
    'Based on',
  ];
  if (trimmed.length < 500 && thinkingPrefixes.some((p) => trimmed.startsWith(p))) {
    const hasMarkdown = /^#{1,3}\s/m.test(trimmed) || /```/.test(trimmed) || /^\|.*\|$/m.test(trimmed);
    if (!hasMarkdown) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a title from the first user query.
 */
function generateTitle(messages: ParsedMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user');
  if (!firstUserMsg) {
    return 'Untitled Conversation';
  }
  let title = firstUserMsg.text.split('\n')[0].trim();
  if (title.length > 80) {
    title = title.substring(0, 77) + '...';
  }
  return title;
}

/**
 * Represents a raw parsed entry before merging consecutive assistant turns.
 */
interface RawEntry {
  role: 'user' | 'assistant' | 'system';
  text: string;
  toolCalls: ToolCallInfo[];
  thinkingText?: string;
}

/**
 * Parse a single JSONL transcript file into structured messages.
 * Consecutive assistant messages are merged: thinking turns are folded
 * into the next substantive response.
 */
export function parseTranscriptFile(
  filePath: string,
  options: { includeToolCalls: boolean; includeThinking: boolean }
): ParsedMessage[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .filter((l) => l.trim().length > 0);

  const rawEntries: RawEntry[] = [];
  for (const line of lines) {
    let entry: TranscriptMessage;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.role === 'system') {
      continue;
    }

    const contentParts = entry.message?.content ?? [];
    const textParts: string[] = [];
    const toolCalls: ToolCallInfo[] = [];
    let thinkingText: string | undefined;

    for (const part of contentParts) {
      if (part.type === 'text' && part.text) {
        textParts.push(part.text);
      } else if (part.type === 'tool_call' && part.name) {
        toolCalls.push({
          name: part.name,
          arguments: part.arguments,
          result: part.result,
        });
      } else if (part.type === 'thinking' && part.thinking) {
        thinkingText = part.thinking;
      }
    }

    const fullText = textParts.join('\n');
    if (!fullText && toolCalls.length === 0) {
      continue;
    }

    rawEntries.push({
      role: entry.role as 'user' | 'assistant',
      text: fullText,
      toolCalls,
      thinkingText,
    });
  }

  const messages: ParsedMessage[] = [];

  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];

    if (entry.role === 'user') {
      const query = extractUserQuery(entry.text);
      if (query) {
        messages.push({ role: 'user', text: query });
      }
      continue;
    }

    if (entry.role === 'assistant') {
      const thinkingParts: string[] = [];
      const responseParts: string[] = [];
      const allToolCalls: ToolCallInfo[] = [];

      // Collect consecutive assistant entries into one merged message.
      // "Thinking" entries are separated from substantive responses.
      while (i < rawEntries.length && rawEntries[i].role === 'assistant') {
        const cur = rawEntries[i];
        if (cur.thinkingText) {
          thinkingParts.push(cur.thinkingText);
        }
        if (looksLikeThinking(cur.text)) {
          thinkingParts.push(cur.text);
        } else if (cur.text) {
          responseParts.push(cur.text);
        }
        allToolCalls.push(...cur.toolCalls);
        i++;
      }
      i--; // outer loop will increment

      const responseText = responseParts.join('\n\n');
      if (!responseText && allToolCalls.length === 0) {
        continue;
      }

      const msg: ParsedMessage = {
        role: 'assistant',
        text: responseText,
      };

      if (options.includeThinking && thinkingParts.length > 0) {
        msg.thinking = thinkingParts.join('\n\n');
      }

      if (options.includeToolCalls && allToolCalls.length > 0) {
        msg.toolCalls = allToolCalls;
      }

      messages.push(msg);
    }
  }

  return messages;
}

/**
 * Parse a complete conversation from a transcript directory.
 */
export function parseConversation(
  transcriptDir: string,
  options: { includeToolCalls: boolean; includeThinking: boolean }
): ParsedConversation {
  const dirName = path.basename(transcriptDir);
  const mainFile = path.join(transcriptDir, `${dirName}.jsonl`);

  if (!fs.existsSync(mainFile)) {
    throw new Error(`Transcript file not found: ${mainFile}`);
  }

  const stat = fs.statSync(mainFile);
  const messages = parseTranscriptFile(mainFile, options);

  const projectDirName = path.basename(path.resolve(transcriptDir, '../..'));

  return {
    id: dirName,
    title: generateTitle(messages),
    messages,
    created: stat.birthtime,
    modified: stat.mtime,
    projectPath: projectDirName,
  };
}

/**
 * Encode a workspace path the same way Cursor encodes project directories.
 * e.g. "/Users/kenneth/workdir/projects/trove" -> "Users-kenneth-workdir-projects-trove"
 */
function encodePathAsCursorDir(fsPath: string): string {
  return fsPath.replace(/^\//, '').replace(/\//g, '-');
}

/**
 * Extract a human-readable project name from a Cursor project dir name.
 * Takes the last path-like segment (after the last recognizable separator).
 */
function extractProjectName(cursorDirName: string): string {
  const parts = cursorDirName.split('-');
  return parts[parts.length - 1] || cursorDirName;
}

/**
 * Discover all transcript files for the current workspace.
 */
export function discoverTranscripts(workspacePath: string): TranscriptFileInfo[] {
  const cursorProjectsDir = getCursorProjectsDir();
  if (!cursorProjectsDir || !fs.existsSync(cursorProjectsDir)) {
    return [];
  }

  const results: TranscriptFileInfo[] = [];
  const encodedWorkspace = encodePathAsCursorDir(workspacePath);

  const projectDirs = fs.readdirSync(cursorProjectsDir);
  for (const projDir of projectDirs) {
    // Match using the encoded form to avoid ambiguity with hyphens in paths
    if (projDir !== encodedWorkspace && !projDir.startsWith(encodedWorkspace + '-') && !encodedWorkspace.startsWith(projDir + '-')) {
      continue;
    }

    const transcriptsDir = path.join(cursorProjectsDir, projDir, 'agent-transcripts');
    if (!fs.existsSync(transcriptsDir)) {
      continue;
    }

    const entries = fs.readdirSync(transcriptsDir);
    for (const entry of entries) {
      const entryPath = path.join(transcriptsDir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(entryPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        continue;
      }

      const mainFile = path.join(entryPath, `${entry}.jsonl`);
      if (!fs.existsSync(mainFile)) {
        continue;
      }

      const hasSubagents = fs.existsSync(path.join(entryPath, 'subagents'));
      const fileStat = fs.statSync(mainFile);

      results.push({
        id: entry,
        path: entryPath,
        projectName: extractProjectName(projDir),
        projectPath: workspacePath,
        modified: fileStat.mtime,
        hasSubagents,
      });
    }
  }

  results.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return results;
}

/**
 * Get a short preview of a transcript for the picker UI.
 */
export function getTranscriptPreview(transcriptPath: string): string {
  const dirName = path.basename(transcriptPath);
  const mainFile = path.join(transcriptPath, `${dirName}.jsonl`);

  try {
    const content = fs.readFileSync(mainFile, 'utf-8');
    const firstLine = content.split('\n').find((l) => l.trim().length > 0);
    if (!firstLine) {
      return '(empty)';
    }

    const entry: TranscriptMessage = JSON.parse(firstLine);
    if (entry.role === 'user') {
      const text = entry.message?.content
        ?.find((p) => p.type === 'text')
        ?.text ?? '';
      const query = extractUserQuery(text);
      if (query) {
        const firstLine = query.split('\n')[0].trim();
        return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine;
      }
    }
  } catch {
    // ignore parse errors
  }
  return '(unable to preview)';
}

function getCursorProjectsDir(): string | undefined {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    return undefined;
  }
  return path.join(home, '.cursor', 'projects');
}
