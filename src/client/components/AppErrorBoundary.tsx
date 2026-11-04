import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    void _error;
    void _info;
    console.error('[ui] Falha inesperada na aplicação');
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-page" role="alert">
          <p className="eyebrow">REALITY BENDER / FALHA</p>
          <h1>Não foi possível abrir esta tela.</h1>
          <p>Recarregue a aplicação. Se persistir, verifique o console técnico do navegador.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar aplicação
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
