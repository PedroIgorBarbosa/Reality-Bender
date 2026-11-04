import { describe, expect, it } from 'vitest';
import { ConfigurationError, parseServerConfig } from '../../src/server/config/env';

describe('parseServerConfig (Issue #1)', () => {
  it('valida configuração válida de desenvolvimento', () => {
    const config = parseServerConfig({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: '3000',
      CLIENT_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
      PUBLIC_BASE_URL: 'http://localhost:5173',
    });
    expect(config.nodeEnv).toBe('development');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.allowedOrigins).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
    expect(config.publicBaseUrl).toBe('http://localhost:5173');
  });

  it('rejeita NODE_ENV inválido, PORT fora de faixa e HOST inválido', () => {
    expect(() =>
      parseServerConfig({ NODE_ENV: 'staging', CLIENT_ORIGINS: 'http://localhost:5173' }),
    ).toThrow(ConfigurationError);

    expect(() =>
      parseServerConfig({ NODE_ENV: 'development', PORT: '70000', CLIENT_ORIGINS: 'http://localhost:5173' }),
    ).toThrow('OUT_OF_RANGE');

    expect(() =>
      parseServerConfig({ NODE_ENV: 'development', PORT: 'abc', CLIENT_ORIGINS: 'http://localhost:5173' }),
    ).toThrow('NOT_INTEGER');

    expect(() =>
      parseServerConfig({ NODE_ENV: 'development', HOST: 'invalid..host', CLIENT_ORIGINS: 'http://localhost:5173' }),
    ).toThrow('INVALID_HOST');
  });

  it('exige CLIENT_ORIGINS e HTTPS para origens não-loopback ou em produção', () => {
    expect(() =>
      parseServerConfig({ NODE_ENV: 'development', CLIENT_ORIGINS: '' }),
    ).toThrow('MISSING_ORIGINS');

    expect(() =>
      parseServerConfig({ NODE_ENV: 'development', CLIENT_ORIGINS: 'http://192.168.1.15:5173' }),
    ).toThrow('INSECURE_ORIGIN');

    expect(() =>
      parseServerConfig({ NODE_ENV: 'production', CLIENT_ORIGINS: 'http://localhost:5173' }),
    ).toThrow('HTTPS_REQUIRED');

    const prodConfig = parseServerConfig({
      NODE_ENV: 'production',
      CLIENT_ORIGINS: 'https://stage.reality-bender.example',
      PUBLIC_BASE_URL: 'https://stage.reality-bender.example',
    });
    expect(prodConfig.allowedOrigins).toEqual(['https://stage.reality-bender.example']);
  });
});
