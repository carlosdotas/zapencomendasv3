# Zap Encomendas - App Android (Capacitor)

Aplicativo Android criado com **Capacitor**, configurado para rodar o site [EncomendasZap](https://zapencomendas.ai.studio/) com **barras do Android estilizadas na cor oficial da marca (`#002B49`) com ícones brancos em alto contraste**, **recebimento de compartilhamentos do Google Maps**, **integração com a agenda de contatos**, **botão Voltar sincronizado com o navegador**, área segura de tela, **aceitação automática de localização (GPS)**, suporte a **segundo plano permanente (app fechado)**, **notificações**, e com o **ícone oficial** do sistema.

---

## 📱 Arquivo APK Atualizado

O novo arquivo APK compilado e pronto para ser instalado no seu celular Android:

- **Arquivo:** [`zap-encomendas.apk`](./zap-encomendas.apk) (na raiz da pasta do projeto)
- **Local alternativo:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Tamanho:** ~8.2 MB

---

## 🎨 Cores das Barras do Android (Atualizado)

1. **Barra de Status (Superior) e Barra de Navegação (Inferior):**
   - Cor de fundo: `#002B49` (Azul escuro oficial do EncomendasZap).
   - Ícones e textos: Branco de alto contraste (`controller.setAppearanceLightStatusBars(false)` e `setAppearanceLightNavigationBars(false)`).
   - O fundo da janela (`windowBackground`) e o container raiz foram configurados em `#002B49`, eliminando qualquer borda branca.
   - Névoa/máscara do Android desativada (`setStatusBarContrastEnforced(false)` e `setNavigationBarContrastEnforced(false)`).

---

## 🛠️ Como recompilar o APK

```bash
npm run build:apk
```
