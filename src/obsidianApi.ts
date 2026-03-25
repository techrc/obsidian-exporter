import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface ObsidianApiOptions {
  apiUrl: string;
  apiKey: string;
}

/**
 * Client for the Obsidian Local REST API.
 * Supports both HTTP and HTTPS (with self-signed certificate).
 */
export class ObsidianApi {
  private apiUrl: string;
  private apiKey: string;

  constructor(options: ObsidianApiOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
  }

  /**
   * Check if the API is reachable and authenticated.
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create or overwrite a file in the vault.
   * PUT /vault/{path} — creates or overwrites the file.
   */
  async putFile(vaultPath: string, content: string): Promise<void> {
    const encodedPath = vaultPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    await this.request('PUT', `/vault/${encodedPath}`, content, {
      'Content-Type': 'text/markdown',
    });
  }

  /**
   * Append content to an existing file, or create it.
   * POST /vault/{path} — appends to the file.
   */
  async appendFile(vaultPath: string, content: string): Promise<void> {
    const encodedPath = vaultPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    await this.request('POST', `/vault/${encodedPath}`, content, {
      'Content-Type': 'text/markdown',
    });
  }

  /**
   * Check if a file exists in the vault.
   */
  async fileExists(vaultPath: string): Promise<boolean> {
    try {
      const encodedPath = vaultPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      await this.request('GET', `/vault/${encodedPath}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open a file in Obsidian.
   */
  async openFile(vaultPath: string): Promise<void> {
    const encodedPath = vaultPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    try {
      await this.request('POST', `/open/${encodedPath}`);
    } catch {
      // Non-critical: file was already saved
    }
  }

  private request(
    method: string,
    urlPath: string,
    body?: string,
    extraHeaders?: Record<string, string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.apiUrl);
      const isHttps = url.protocol === 'https:';

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        ...extraHeaders,
      };

      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      };

      const transport = isHttps ? https : http;

      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else if (res.statusCode === 404) {
            reject(new Error(`Not found: ${urlPath}`));
          } else {
            reject(
              new Error(
                `Obsidian API error: ${res.statusCode} ${res.statusMessage} - ${data}`
              )
            );
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Cannot connect to Obsidian: ${err.message}`));
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request to Obsidian timed out'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}
