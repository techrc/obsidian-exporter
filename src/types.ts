export interface TranscriptContentPart {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking';
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: string;
  thinking?: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  message: {
    content: TranscriptContentPart[];
  };
}

export interface ParsedMessage {
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ToolCallInfo[];
  thinking?: string;
}

export interface ToolCallInfo {
  name: string;
  arguments?: Record<string, unknown>;
  result?: string;
}

export interface ParsedConversation {
  id: string;
  title: string;
  messages: ParsedMessage[];
  created: Date;
  modified: Date;
  projectPath: string;
}

export interface ExtensionConfig {
  apiKey: string;
  apiUrl: string;
  vaultPath: string;
  includeToolCalls: boolean;
  includeThinking: boolean;
  tags: string[];
}

export interface TranscriptFileInfo {
  id: string;
  path: string;
  projectName: string;
  projectPath: string;
  modified: Date;
  hasSubagents: boolean;
}
