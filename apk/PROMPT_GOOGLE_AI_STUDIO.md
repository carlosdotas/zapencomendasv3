# 🚀 Prompt Mestre de Integração para o Google AI Studio (Build)

Copie e cole todo o conteúdo abaixo diretamente no chat do **Google AI Studio** para orientar cirurgicamente a integração nativa com o aplicativo Android (GPS, Notificações, Voltar, WhatsApp, Agenda de Contatos e **Compartilhamento do Google Maps**):

---

```markdown
ATENÇÃO: A nossa aplicação EncomendasZap (https://zapencomendas.ai.studio/) já está PRONTA e em pleno funcionamento. 
NÃO reescreva o sistema, NÃO altere o design, NÃO modifique regras de negócio e NÃO remova nenhuma funcionalidade existente.

O objetivo deste ajuste é apenas uma ORIENTAÇÃO DE INTEGRAÇÃO com o nosso aplicativo Android oficial (Capacitor/WebView) que já empacotou este site.

O aplicativo Android injeta nativamente no navegador o objeto global `window.AndroidApp` e dispara eventos nativos no `window`.

Por favor, faça apenas pequenas adições pontuais e seguras (utilizando sempre verificações `if (window.AndroidApp)` para que o site continue funcionando perfeitamente em navegadores normais):

---

### 1. 🗺️ Receber Compartilhamento do Google Maps
- O aplicativo Android agora aparece no menu **"Compartilhar"** do Google Maps e outros navegadores de mapas.
- Quando o usuário compartilha um local do Google Maps para o EncomendasZap, o aplicativo entrega os dados formatados diretamente para a página.
- Adicione um listener em seu componente de Mapa ou Criação de Pedido:
  ```javascript
  // 1. Escuta novos compartilhamentos em tempo real
  window.addEventListener('mapShareReceived', (event) => {
    const { raw, url, lat, lng } = event.detail;
    console.log('Local recebido do Google Maps:', { raw, url, lat, lng });

    if (lat && lng) {
      // Se vier com latitude e longitude, centralize o mapa ou defina como destino da rota:
      // ex: setDestination({ lat, lng }); ou map.panTo([lat, lng]);
    } else if (url) {
      // Se vier link curto (ex: maps.app.goo.gl/xyz), preencha o campo de busca/endereço
    }
  });

  // 2. Verifica se o app foi aberto diretamente pelo menu Compartilhar do Maps
  if (window.AndroidApp && window.AndroidApp.getLastSharedMap) {
    const lastShare = window.AndroidApp.getLastSharedMap();
    if (lastShare) {
      try {
        const data = JSON.parse(lastShare);
        // Aplique os dados (lat, lng, url) no seu mapa
        window.AndroidApp.clearLastSharedMap(); // limpa após processar
      } catch (e) {}
    }
  }
  ```

---

### 2. 📖 Agenda de Contatos do Celular (Onde houver formulários de cliente/destinatário)
- Onde existir campo de telefone ou nome do cliente/destinatário:
  - Adicione um botão discreto de agenda (ícone de contatos) para preenchimento rápido.
  - Para abrir a agenda:
    ```javascript
    if (window.AndroidApp && window.AndroidApp.pickContact) {
      window.AndroidApp.pickContact();
    }
    ```
  - Para receber o contato selecionado:
    ```javascript
    window.addEventListener('contactSelected', (e) => {
      const { name, phone } = e.detail; // preencha seus inputs de nome e telefone aqui
    });
    ```
  - Se houver botão de salvar contato do cliente:
    `window.AndroidApp.saveContact(nome, telefone);`

---

### 3. 🔔 Alertas e Vibração (Ao mudar status de pedidos)
- Nos pontos do seu código onde um pedido é criado, aceito ou entregue:
  - Dispare o alerta nativo e vibração no celular do entregador:
    ```javascript
    if (window.AndroidApp) {
      window.AndroidApp.showNotification("EncomendasZap", "Status do pedido atualizado!");
      window.AndroidApp.vibrate(200); // vibra por 200ms
    }
    ```

---

### 4. 📍 GPS e Telemetria em Segundo Plano
- Verifique sua rotina atual de envio de localização (GPS / `watchPosition` / heartbeat da API):
  - Certifique-se de que ela NÃO seja cancelada ou pausada quando a tela do celular apagar ou a aba for minimizada (`document.hidden`). O aplicativo Android possui serviço em segundo plano permanente que mantém o GPS acordado.
  - Se quiser ler a última coordenada diretamente do serviço nativo Android:
    `const lat = window.AndroidApp?.getLatitude();`
    `const lng = window.AndroidApp?.getLongitude();`

---

### 5. 🔙 Fechamento de Modais com o Botão Voltar do Celular
- O aplicativo Android aciona `window.history.back()` ao pressionar o botão físico/gesto de Voltar do aparelho.
- Caso você use modais, abas ou telas pop-up:
  - Ao abrir um modal, use `window.history.pushState({ modalOpen: true }, '');`
  - No evento `popstate`, se o modal estiver aberto, apenas feche o modal em vez de mudar de página.

---

### 6. 💬 Links de WhatsApp
- Onde houver links para WhatsApp, use a rota nativa direta:
  `window.AndroidApp ? window.AndroidApp.openWhatsApp(telefone, mensagem) : window.open(...)`

Realize apenas as conexões acima de forma cirúrgica, preservando 100% do código atual.
```
