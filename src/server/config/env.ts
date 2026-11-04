import { isIP } from 'node:net';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ServerConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly publicBaseUrl: string | null;
}

export class ConfigurationError extends Error {
  constructor(
    public readonly variable: string,
    public readonly code: string,
  ) {
    super('Configuração inválida: ' + variable + ' (' + code + ')');
    this.name = 'ConfigurationError';
  }
}

function validHostname(input: string): boolean {
  if (isIP(input) !== 0) return true;
  if (input.length < 1 || input.length > 253) return false;
  return input.split('.').every((label) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function parseOrigin(origin: string, env: NodeEnvironment): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConfigurationError('CLIENT_ORIGINS', 'INVALID_ORIGIN');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash ||
    url.origin !== origin
  ) {
    throw new ConfigurationError('CLIENT_ORIGINS', 'INVALID_ORIGIN');
  }
  if (env === 'production' && url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new ConfigurationError('CLIENT_ORIGINS', 'HTTPS_REQUIRED');
  }
  if (env === 'production' && url.protocol !== 'https:' && isLoopback(url.hostname)) {
    throw new ConfigurationError('CLIENT_ORIGINS', 'HTTPS_REQUIRED');
  }
  if (env !== 'test' && url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new ConfigurationError('CLIENT_ORIGINS', 'INSECURE_ORIGIN');
  }
  return url.origin;
}

function parsePublicUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError('PUBLIC_BASE_URL', 'INVALID_URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash
  ) {
    throw new ConfigurationError('PUBLIC_BASE_URL', 'INVALID_URL');
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw new ConfigurationError('PUBLIC_BASE_URL', 'HTTPS_REQUIRED');
  }
  return url.origin;
}

export function parseServerConfig(raw: NodeJS.ProcessEnv): ServerConfig {
  const nodeEnv = raw.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new ConfigurationError('NODE_ENV', 'INVALID_ENV');
  }
  const environment = nodeEnv as NodeEnvironment;
  const host = raw.HOST?.trim() || '127.0.0.1';
  if (!validHostname(host)) {
    throw new ConfigurationError('HOST', 'INVALID_HOST');
  }
  const portText = raw.PORT?.trim() || '3000';
  if (!/^[0-9]+$/.test(portText)) {
    throw new ConfigurationError('PORT', 'NOT_INTEGER');
  }
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('PORT', 'OUT_OF_RANGE');
  }
  const origins = Array.from(new Set(
    (raw.CLIENT_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
  ));
  if (origins.length === 0) {
    throw new ConfigurationError('CLIENT_ORIGINS', 'MISSING_ORIGINS');
  }

  return Object.freeze({
    nodeEnv: environment,
    host,
    port,
    allowedOrigins: Object.freeze(origins.map((origin) => parseOrigin(origin, environment))),
    publicBaseUrl: parsePublicUrl(raw.PUBLIC_BASE_URL ?? ''),
  });
}
