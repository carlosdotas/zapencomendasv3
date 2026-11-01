/**
 * Serviço de Gerenciamento da Navegação de Retorno (Android Back Button / Gesto Voltar / Tecla Voltar)
 * 
 * Permite que qualquer janela, modal, gaveta retrátil, sub-etapa de assistente ou painel
 * seja fechado sequencialmente quando o usuário aciona o botão Voltar nativo do Android,
 * o gesto de deslizar para voltar ou a tecla Esc/Back.
 */

export type BackResult = 'keep_open' | 'closed' | void;
export type BackHandlerFn = () => BackResult;

export interface BackEntry {
  id: string;
  onBack: BackHandlerFn;
  priority: number;
}

class BackNavigationService {
  private stack: BackEntry[] = [];
  private ignorePopCount = 0;
  private initialized = false;

  public init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // Inicializa o estado raiz do histórico do navegador se ainda não existir
    try {
      if (!window.history.state || !window.history.state.ezAppRoot) {
        window.history.replaceState({ ezAppRoot: true, depth: 0 }, '');
      }
    } catch {}

    window.addEventListener('popstate', this.handlePopState);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private handlePopState = (event: PopStateEvent) => {
    // Se o popstate foi disparado programaticamente por nós mesmos para sincronizar a pilha após clique em 'X', ignora
    if (this.ignorePopCount > 0) {
      this.ignorePopCount--;
      return;
    }

    if (this.stack.length === 0) {
      return;
    }

    // Retira o elemento mais recente da pilha (topo)
    const entry = this.stack.pop();
    if (!entry) return;

    try {
      const result = entry.onBack();

      // Caso a ação seja um passo interno que mantém a janela aberta (ex: voltar etapa 3 -> 2 no NewOrderModal),
      // reinsere na pilha e empurra novo estado no histórico para o próximo botão Voltar funcionar
      if (result === 'keep_open') {
        this.stack.push(entry);
        try {
          window.history.pushState({ modalOpen: true, ezBackId: entry.id, depth: this.stack.length }, '');
        } catch {}
      }
    } catch (err) {
      console.warn('[BackNavigation] Erro ao executar retorno:', err);
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    // Intercepta botão de Voltar de controles remotos/teclados e Android (keyCode 4 / Escape / Back)
    if (event.key === 'Escape' || event.key === 'Back' || (event as any).keyCode === 4) {
      if (this.stack.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        this.triggerBack();
      }
    }
  };

  /**
   * Dispara a ação de voltar como se o botão físico/gesto tivesse sido pressionado
   */
  public triggerBack() {
    if (typeof window === 'undefined') return;
    if (this.stack.length > 0) {
      window.history.back();
    }
  }

  /**
   * Registra um componente ou modal na pilha de navegação
   */
  public push(id: string, onBack: BackHandlerFn, priority: number = 0) {
    if (typeof window === 'undefined') return;
    this.init();

    // Remove registro prévio com o mesmo ID para evitar duplicidades
    const existingIdx = this.stack.findIndex(e => e.id === id);
    if (existingIdx !== -1) {
      this.stack.splice(existingIdx, 1);
    }

    // Insere o novo handler
    this.stack.push({ id, onBack, priority });

    // Ordena preservando a ordem de inserção mas priorizando prioridades mais altas no topo se houver
    this.stack.sort((a, b) => a.priority - b.priority);

    // Empurra um estado no histórico para capturar o próximo evento popstate
    try {
      window.history.pushState({ modalOpen: true, ezBackId: id, depth: this.stack.length }, '');
    } catch {}
  }

  /**
   * Remove um componente da pilha (usado quando o modal é fechado diretamente via clique no 'X' ou botão da UI)
   */
  public remove(id: string, popHistory: boolean = true) {
    if (typeof window === 'undefined') return;

    const idx = this.stack.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
      if (popHistory) {
        this.ignorePopCount++;
        try {
          window.history.back();
        } catch {}
      }
    }
  }

  public hasEntries(): boolean {
    return this.stack.length > 0;
  }

  public getStackSize(): number {
    return this.stack.length;
  }
}

export const backNavigationService = new BackNavigationService();
