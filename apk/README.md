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
cd apk
npm run build:apk
```

O comando gera os dois APKs e, somente após validar suas cópias, atualiza
`public/download/apk-version.json` com a versão e o SHA-256 do APK gerado.
Publique o APK e esse manifesto juntos no site em `/download/`. Não atualize
o manifesto sem publicar o APK correspondente. Atualizações apenas do site
não exigem reinstalar o aplicativo.

O aplicativo verifica o manifesto ao abrir, ao retornar ao primeiro plano e a
cada cinco minutos enquanto estiver aberto. Ao detectar um APK mais recente,
exige a atualização e abre o download oficial no navegador; o usuário deve
concluir a instalação pelo Android e pode precisar permitir instalações dessa
origem. Uma atualização já detectada continua obrigatória mesmo sem internet.
Sem acesso ao manifesto, o aplicativo registra a falha e mantém a última
informação conhecida. A detecção começa a funcionar após a instalação de uma
versão do APK que contenha esse recurso. O novo APK deve ser assinado com a
mesma chave da versão instalada para permitir a atualização.

Na abertura, o Android solicita as permissões ainda não concedidas para
localização, notificações, câmera, microfone, contatos e fotos, conforme a
versão do sistema. No Android 11 ou superior, a localização em segundo plano
é configurada separadamente em **Permissões > Localização > Permitir o tempo
todo**. Se uma permissão for negada ou bloqueada pelo Android, o aplicativo
oferece acesso às configurações; o usuário pode continuar, mas os recursos
correspondentes podem ficar indisponíveis. A isenção de bateria continua sendo
solicitada quando o rastreamento em segundo plano é ativado.
