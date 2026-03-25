# Obsidian Exporter

[中文文档](./README_zh.md)

A VS Code / Cursor extension that exports Cursor Agent conversations to Obsidian via the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api), saving them as Markdown notes.

## Features

- **One-click sync**: Export the current or historical Agent conversation to Obsidian
- **Conversation picker**: Quick Pick list showing all conversations sorted by time
- **YAML Frontmatter**: Auto-generated metadata including id, title, source, project, created, modified, tags, etc.
- **Obsidian Callouts**: User messages use `[!QUESTION]`, AI replies use `[!NOTE]` format
- **Smart merging**: Automatically merges consecutive assistant messages, separating internal thinking from the actual response
- **Optional thinking**: Optionally export AI's internal reasoning process (collapsed `[!ABSTRACT]` callout)
- **Optional tool calls**: Optionally export tool call details
- **Status bar button**: One-click sync from the bottom status bar

## Prerequisites

- Cursor (or VS Code)
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin

## Installation

### From Source

```bash
git clone https://github.com/techrc/obsidian-exporter.git
cd obsidian-exporter
npm install
npm run compile
```

Then in Cursor/VS Code:
1. Press `Cmd+Shift+P` → `Extensions: Install from VSIX...`
2. Or press `F5` to launch the Extension Development Host for debugging

### Package as VSIX

```bash
npm install -g @vscode/vsce
vsce package
```

## Configuration

Search for `obsidianExporter` in Cursor/VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `apiKey` | `""` | Obsidian Local REST API key |
| `apiUrl` | `https://127.0.0.1:27124` | API URL (supports HTTP and HTTPS) |
| `vaultPath` | `AI/Cursor` | Save directory within the Obsidian vault |
| `includeToolCalls` | `false` | Export tool call details |
| `includeThinking` | `false` | Export AI thinking process |
| `tags` | `["ai-conversation", "cursor"]` | Frontmatter tags |

## Usage

### Option 1: Sync the most recent conversation
- `Cmd+Shift+P` → `Obsidian Exporter: Sync Current Chat to Obsidian`

### Option 2: Select a conversation to sync
- `Cmd+Shift+P` → `Obsidian Exporter: Select and Sync Chat to Obsidian`
- Or click the `$(cloud-upload) Sync to Obsidian` button in the bottom status bar

## Output Format

```markdown
---
id: cursor_e6df7638-a7d6-40f1-8830-e77f379e32eb
title: "How to implement JWT authentication"
source: cursor
project: /Users/techrc/workdir/projects/my-project
created: 2026-03-25T12:00:00.000Z
modified: 2026-03-25T12:30:00.000Z
tags:
  - ai-conversation
  - cursor
message_count: 4
---

> [!QUESTION] User
> How to implement JWT authentication?

> [!NOTE] Cursor
> To implement JWT authentication, you need to...
```

When thinking export is enabled, thinking content is displayed as a collapsed callout:

```markdown
> [!ABSTRACT]- Thinking
> The user wants to implement JWT authentication...

> [!NOTE] Cursor
> To implement JWT authentication, you need to...
```

## Setting Up Obsidian

1. Install the **Local REST API** plugin in Obsidian
2. Enable the plugin and copy the API Key
3. Enter the API Key and API URL in Cursor settings

## Architecture

```
src/
├── extension.ts          # Extension entry point, registers commands and status bar
├── transcriptParser.ts   # Parses Cursor JSONL conversation transcripts
├── markdownFormatter.ts  # Formats conversations as Obsidian Markdown
├── obsidianApi.ts        # Obsidian Local REST API client
└── types.ts              # Type definitions
```

## Acknowledgements

Inspired by the [obsidian-AI-exporter](https://github.com/sho7650/obsidian-AI-exporter) Chrome extension.

## License

MIT
