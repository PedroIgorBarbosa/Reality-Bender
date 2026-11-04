import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../src/client/App';
import { useSystemConnection } from '../../src/client/hooks/use-system-connection';

vi.mock('../../src/client/hooks/use-system-connection', () => ({
  useSystemConnection: vi.fn(),
}));

const reconnect = vi.fn();

function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSystemConnection).mockReturnValue({
    state: { phase: 'OFFLINE', reason: 'Teste: servidor indisponível' },
    reconnect,
  });
});
afterEach(cleanup);

describe('rotas e acessibilidade', () => {
  it('mostra stage sem inventar vídeo, QR Code ou conexão', () => {
    const { container } = open('/stage');
    expect(screen.getByRole('heading', { name: 'Tela de apresentação' })).toBeTruthy();
    expect(screen.getByText('Servidor desconectado')).toBeTruthy();
    expect(container.querySelector('video, canvas, img')).toBeNull();
    expect(screen.getByRole('button', { name: /Criar sessão \/ QR/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reconectar servidor' }));
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('mostra estado verificado sem afirmar transmissão em andamento', () => {
    vi.mocked(useSystemConnection).mockReturnValue({
      state: { phase: 'ONLINE', protocolVersion: 1, connectedAt: new Date().toISOString() },
      reconnect,
    });
    open('/stage');
    expect(screen.getByText('Servidor conectado')).toBeTruthy();
    expect(screen.getByText(/sessão de apresentação ainda não implementada/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconectar servidor' })).toBeNull();
  });

  it('mantém câmera desligada no controle e informa ausência de convite', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    open('/control');
    expect(screen.getByText(/Abra esta página pelo QR Code quando o pareamento estiver disponível/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Iniciar câmera/i }).hasAttribute('disabled')).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('não valida nem revela um convite só porque aparece na URL', () => {
    const { container } = open('/control?invite=SUPER_SECRET_TOKEN_001');
    expect(screen.getByText(/Convite recebido na URL. A validação do convite será implementada/i)).toBeTruthy();
    expect(container.textContent).not.toContain('SUPER_SECRET_TOKEN_001');
  });

  it('exibe 404 com retorno à projeção', () => {
    open('/rota-que-nao-existe');
    expect(screen.getByRole('heading', { name: 'Página não encontrada.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir tela de apresentação' }).getAttribute('href')).toBe('/stage');
  });
});
