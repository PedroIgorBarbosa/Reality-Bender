import { describe, expect, it } from 'vitest';
import { ConfigurationError, parseServerConfig } from '../../src/server/config/env';

const basic = { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3000', CLIENT_ORIGINS: 'http://localhost:5173' };

describe('configuração de ambiente', () => {
  it('aceita porta, origens explícitas e URL pública HTTPS', () => {
    expect(parseServerConfig({ ...basic, PUBLIC_BASE_URL: 'https://reality.example.com/' })).toMatchObject({
      port: 3000,
      host: '127.0.0.1',
      publicBaseUrl: 'https://reality.example.com',
      allowedOrigins: ['http://localhost:5173'],
    });
  });
  it('rejeita porta não numérica, zero e fora do intervalo', () => {
    for (const port of ['abc', '0', '70000', '-2', '3000.5']) {
      expect(() => parseServerConfig({ ...basic, PORT: port })).toThrow(ConfigurationError);
    }
  });
  it('não aceita origem HTTP externa em desenvolvimento ou produção', () => {
    expect(() => parseServerConfig({ ...basic, CLIENT_ORIGINS: 'http://site.com' })).toThrow(ConfigurationError);
    expect(() => parseServerConfig({ ...basic, NODE_ENV: 'production', CLIENT_ORIGINS: 'http://site.com' })).toThrow(ConfigurationError);
  });
  it('rejeita URLs malformadas e credenciais no endereço público', () => {
    for (const url of ['foo', 'http://site.com', 'https://a:b@example.com', 'https://example.com/path']) {
      expect(() => parseServerConfig({ ...basic, PUBLIC_BASE_URL: url })).toThrow(ConfigurationError);
    }
  });
  it('rejeita origem com caminho, consulta, credenciais ou wildcard', () => {
    for (const origin of ['*', 'https://site.com/path', 'https://user@site.com', 'https://site.com?q=1']) {
      expect(() => parseServerConfig({ ...basic, CLIENT_ORIGINS: origin })).toThrow(ConfigurationError);
    }
  });
  it('exige origens e recusa ambiente desconhecido', () => {
    expect(() => parseServerConfig({ ...basic, CLIENT_ORIGINS: '' })).toThrow(ConfigurationError);
    expect(() => parseServerConfig({ ...basic, NODE_ENV: 'broken' })).toThrow(ConfigurationError);
  });
  it('permite origens HTTPS em produção e remove duplicatas', () => {
    const result = parseServerConfig({ ...basic, NODE_ENV: 'production', CLIENT_ORIGINS: 'https://site.com, https://site.com' });
    expect(result.allowedOrigins).toEqual(['https://site.com']);
    expect(Object.isFrozen(result.allowedOrigins)).toBe(true);
  });
});
