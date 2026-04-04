import { readFile, writeFile, mkdir, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { generateKeyPair, publicKeyFromPrivate } from './secp256k1.js';
import type { KeyPair, KeystoreConfig } from '../types/index.js';

const DEFAULT_BASE = join(homedir(), '.os1');

/**
 * Secure local keystore for secp256k1 signing keys and JWT secrets.
 *
 * Layout:
 *   ~/.os1/config.json          — SDK configuration
 *   ~/.os1/keys/jwt.key         — HMAC secret (chmod 0600)
 *   ~/.os1/keys/{officeId}/{agent}.key — secp256k1 private key (chmod 0600)
 *   ~/.os1/sessions/{id}.json   — Active session state
 */
export class Keystore {
  private basePath: string;

  constructor(config?: KeystoreConfig) {
    this.basePath = config?.basePath ?? join(DEFAULT_BASE, 'keys');
  }

  /**
   * Ensure the keystore directory exists with restricted permissions.
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  /**
   * Write a secret file with 0600 permissions.
   */
  private async writeSecret(path: string, data: Buffer | string): Promise<void> {
    const dir = join(path, '..');
    await this.ensureDir(dir);
    await writeFile(path, data);
    await chmod(path, 0o600);
  }

  /**
   * Store a secp256k1 private key for an agent.
   */
  async storeAgentKey(officeId: string, agentName: string, privateKey: Uint8Array): Promise<void> {
    const keyPath = join(this.basePath, officeId, `${agentName}.key`);
    await this.writeSecret(keyPath, Buffer.from(privateKey));
  }

  /**
   * Load a secp256k1 private key for an agent.
   */
  async loadAgentKey(officeId: string, agentName: string): Promise<Uint8Array> {
    const keyPath = join(this.basePath, officeId, `${agentName}.key`);
    try {
      const data = await readFile(keyPath);
      return new Uint8Array(data);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`No signing key found for ${agentName} in office ${officeId}. Run 'os1-admin keys provision' first.`);
      }
      throw err;
    }
  }

  /**
   * Check if an agent key exists.
   */
  async hasAgentKey(officeId: string, agentName: string): Promise<boolean> {
    const keyPath = join(this.basePath, officeId, `${agentName}.key`);
    try {
      await stat(keyPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate and store a new key pair for an agent.
   * Returns the key pair (public key hex + private key bytes).
   */
  async generateAndStore(officeId: string, agentName: string): Promise<KeyPair> {
    const kp = generateKeyPair();
    await this.storeAgentKey(officeId, agentName, kp.privateKey);
    return kp;
  }

  /**
   * Store the JWT/HMAC secret.
   */
  async storeJWTSecret(secret: string): Promise<void> {
    const keyPath = join(this.basePath, 'jwt.key');
    await this.writeSecret(keyPath, secret);
  }

  /**
   * Load the JWT/HMAC secret.
   */
  async loadJWTSecret(): Promise<string> {
    const keyPath = join(this.basePath, 'jwt.key');
    try {
      return (await readFile(keyPath, 'utf-8')).trim();
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error("No JWT secret found. Run 'os1-admin init' first.");
      }
      throw err;
    }
  }

  /**
   * Get the public key for a stored agent key.
   */
  async getPublicKey(officeId: string, agentName: string): Promise<string> {
    const privateKey = await this.loadAgentKey(officeId, agentName);
    return publicKeyFromPrivate(privateKey);
  }

  /**
   * List all stored agent keys for an office.
   */
  async listAgentKeys(officeId: string): Promise<string[]> {
    const dir = join(this.basePath, officeId);
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(dir);
      return files
        .filter((f) => f.endsWith('.key'))
        .map((f) => f.replace('.key', ''));
    } catch {
      return [];
    }
  }

  /**
   * Delete an agent key.
   */
  async deleteAgentKey(officeId: string, agentName: string): Promise<void> {
    const keyPath = join(this.basePath, officeId, `${agentName}.key`);
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(keyPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Store SDK configuration.
   */
  async storeConfig(config: Record<string, unknown>): Promise<void> {
    const configPath = join(DEFAULT_BASE, 'config.json');
    await this.ensureDir(DEFAULT_BASE);
    await writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Load SDK configuration.
   */
  async loadConfig(): Promise<Record<string, unknown>> {
    const configPath = join(DEFAULT_BASE, 'config.json');
    try {
      return JSON.parse(await readFile(configPath, 'utf-8'));
    } catch {
      return {};
    }
  }
}
