import * as vscode from 'vscode';
import * as path from 'path';
import {
  discoverTranscripts,
  parseConversation,
  getTranscriptPreview,
} from './transcriptParser';
import { formatConversation, generateFilename } from './markdownFormatter';
import { ObsidianApi } from './obsidianApi';
import { ExtensionConfig, TranscriptFileInfo } from './types';

function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('obsidianExporter');
  return {
    apiKey: config.get('apiKey', ''),
    apiUrl: config.get('apiUrl', 'https://127.0.0.1:27124'),
    vaultPath: config.get('vaultPath', 'AI/Cursor'),
    includeToolCalls: config.get('includeToolCalls', false),
    includeThinking: config.get('includeThinking', false),
    tags: config.get('tags', ['ai-conversation', 'cursor']),
  };
}

function validateConfig(config: ExtensionConfig): string | undefined {
  if (!config.apiKey) {
    return 'Please configure Obsidian API Key first (Settings → obsidianExporter.apiKey)';
  }
  if (!config.apiUrl) {
    return 'Please configure Obsidian API URL first (Settings → obsidianExporter.apiUrl)';
  }
  return undefined;
}

/**
 * Get workspace path from currently open VS Code workspace.
 */
function getWorkspacePath(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return undefined;
}

/**
 * Sync a single transcript to Obsidian.
 */
async function syncTranscript(
  transcriptInfo: TranscriptFileInfo,
  config: ExtensionConfig
): Promise<void> {
  const conversation = parseConversation(transcriptInfo.path, {
    includeToolCalls: config.includeToolCalls,
    includeThinking: config.includeThinking,
  });

  if (conversation.messages.length === 0) {
    vscode.window.showWarningMessage('This conversation has no exportable messages');
    return;
  }

  const markdown = formatConversation(conversation, config);
  const filename = generateFilename(conversation);
  const vaultFilePath = `${config.vaultPath}/${filename}`;

  const api = new ObsidianApi({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
  });

  const connected = await api.checkConnection();
  if (!connected) {
    const action = await vscode.window.showErrorMessage(
      'Cannot connect to Obsidian Local REST API. Please make sure Obsidian is running and the Local REST API plugin is installed.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'obsidianExporter'
      );
    }
    return;
  }

  await api.putFile(vaultFilePath, markdown);

  const openAction = await vscode.window.showInformationMessage(
    `Synced to Obsidian: ${vaultFilePath}`,
    'Open in Obsidian'
  );

  if (openAction === 'Open in Obsidian') {
    await api.openFile(vaultFilePath);
  }
}

/**
 * Command: Sync the current (most recent) chat.
 */
async function syncCurrentChat(): Promise<void> {
  const config = getConfig();
  const error = validateConfig(config);
  if (error) {
    const action = await vscode.window.showErrorMessage(error, 'Open Settings');
    if (action === 'Open Settings') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'obsidianExporter'
      );
    }
    return;
  }

  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage('Please open a workspace first');
    return;
  }

  const transcripts = discoverTranscripts(workspacePath);
  if (transcripts.length === 0) {
    vscode.window.showWarningMessage('No Cursor Agent conversations found');
    return;
  }

  const mostRecent = transcripts[0];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Syncing conversation to Obsidian...',
      cancellable: false,
    },
    async () => {
      try {
        await syncTranscript(mostRecent, config);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

/**
 * Command: Select a chat from the list and sync it.
 */
async function selectAndSync(): Promise<void> {
  const config = getConfig();
  const error = validateConfig(config);
  if (error) {
    const action = await vscode.window.showErrorMessage(error, 'Open Settings');
    if (action === 'Open Settings') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'obsidianExporter'
      );
    }
    return;
  }

  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage('Please open a workspace first');
    return;
  }

  const transcripts = discoverTranscripts(workspacePath);
  if (transcripts.length === 0) {
    vscode.window.showWarningMessage('No Cursor Agent conversations found');
    return;
  }

  const items = transcripts.map((t) => {
    const preview = getTranscriptPreview(t.path);
    const timeAgo = formatTimeAgo(t.modified);
    return {
      label: preview,
      description: `${t.projectName} · ${timeAgo}`,
      detail: `ID: ${t.id.substring(0, 8)}...${t.hasSubagents ? ' (with subagents)' : ''}`,
      transcript: t,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a conversation to sync to Obsidian',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Syncing conversation to Obsidian...',
      cancellable: false,
    },
    async () => {
      try {
        await syncTranscript(selected.transcript, config);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) { return 'just now'; }
  if (minutes < 60) { return `${minutes} min ago`; }
  if (hours < 24) { return `${hours} hr ago`; }
  if (days < 30) { return `${days} days ago`; }
  return date.toLocaleDateString('en-US');
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'obsidianExporter.syncCurrentChat',
      syncCurrentChat
    ),
    vscode.commands.registerCommand(
      'obsidianExporter.selectAndSync',
      selectAndSync
    )
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(cloud-upload) Sync to Obsidian';
  statusBarItem.tooltip = 'Export current Agent conversation to Obsidian';
  statusBarItem.command = 'obsidianExporter.selectAndSync';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {}
