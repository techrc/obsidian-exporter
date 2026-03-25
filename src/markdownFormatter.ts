import { ParsedConversation, ParsedMessage, ExtensionConfig } from './types';

/**
 * Escape a string for use in YAML frontmatter values.
 */
function yamlEscape(value: string): string {
  if (/[:#\[\]{}&*!|>'"%@`]/.test(value) || value.trim() !== value) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Generate YAML frontmatter block.
 */
function generateFrontmatter(
  conversation: ParsedConversation,
  config: ExtensionConfig
): string {
  const lines = [
    '---',
    `id: cursor_${conversation.id}`,
    `title: ${yamlEscape(conversation.title)}`,
    `source: cursor`,
    `project: ${yamlEscape(conversation.projectPath)}`,
    `created: ${conversation.created.toISOString()}`,
    `modified: ${conversation.modified.toISOString()}`,
    `tags:`,
  ];

  for (const tag of config.tags) {
    lines.push(`  - ${tag}`);
  }

  lines.push(`message_count: ${conversation.messages.length}`);
  lines.push('---');

  return lines.join('\n');
}

/**
 * Format a single message as an Obsidian callout.
 */
function formatMessage(
  message: ParsedMessage,
  config: ExtensionConfig
): string {
  const parts: string[] = [];

  if (message.role === 'user') {
    parts.push(formatCallout('QUESTION', 'User', message.text));
  } else {
    if (config.includeThinking && message.thinking) {
      parts.push(formatCollapsedCallout('ABSTRACT', 'Thinking', message.thinking));
    }

    if (config.includeToolCalls && message.toolCalls) {
      for (const tool of message.toolCalls) {
        const toolContent = formatToolCall(tool);
        parts.push(formatCollapsedCallout('ABSTRACT', `Tool: ${tool.name}`, toolContent));
      }
    }

    parts.push(formatCallout('NOTE', 'Cursor', message.text));
  }

  return parts.join('\n\n');
}

/**
 * Format an Obsidian callout block.
 */
function formatCallout(type: string, title: string, content: string): string {
  const lines = content.split('\n');
  const calloutLines = [`> [!${type}] ${title}`];
  for (const line of lines) {
    calloutLines.push(`> ${line}`);
  }
  return calloutLines.join('\n');
}

/**
 * Format a collapsed Obsidian callout block (collapsed by default).
 */
function formatCollapsedCallout(type: string, title: string, content: string): string {
  const lines = content.split('\n');
  const calloutLines = [`> [!${type}]- ${title}`];
  for (const line of lines) {
    calloutLines.push(`> ${line}`);
  }
  return calloutLines.join('\n');
}

/**
 * Format tool call information as readable text.
 */
function formatToolCall(tool: { name: string; arguments?: Record<string, unknown>; result?: string }): string {
  const parts: string[] = [];
  if (tool.arguments) {
    const argsStr = JSON.stringify(tool.arguments, null, 2);
    parts.push('```json\n' + argsStr + '\n```');
  }
  if (tool.result) {
    parts.push('**Result:**\n' + tool.result);
  }
  return parts.join('\n\n') || '(no details)';
}

/**
 * Format an entire conversation as a Markdown document
 * with YAML frontmatter and Obsidian callouts.
 */
export function formatConversation(
  conversation: ParsedConversation,
  config: ExtensionConfig
): string {
  const parts: string[] = [];

  parts.push(generateFrontmatter(conversation, config));
  parts.push('');

  for (const message of conversation.messages) {
    parts.push(formatMessage(message, config));
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate a safe filename from a conversation title.
 */
export function generateFilename(conversation: ParsedConversation): string {
  let name = conversation.title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length > 100) {
    name = name.substring(0, 97) + '...';
  }

  if (!name) {
    name = `cursor-${conversation.id.substring(0, 8)}`;
  }

  return `${name}.md`;
}
