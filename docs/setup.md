# Configuração do WhatsApp (Fase 3) e do frete (Fase 5)

Passo a passo para ligar a Edge Function `whatsapp-webhook` a um número real
da WhatsApp Cloud API. Os nomes de menus da Meta mudam com frequência; na
dúvida, siga a [documentação oficial](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started).

## 1. Aplicativo e número na Meta

1. Em [Meta for Developers](https://developers.facebook.com/apps), criar um app
   do tipo **Business** e adicionar o produto **WhatsApp**.
2. Associar a conta WhatsApp Business e o número da loja (ou usar o número de
   teste da Meta durante o desenvolvimento).
3. **Coexistência:** confirmar se o número pode ser usado ao mesmo tempo pela
   Cloud API e pelo aplicativo WhatsApp Business (seção 4.4 da arquitetura).
   Se não puder, definir como a responsável vai atender as conversas
   transferidas antes de ir para produção.

## 2. Credenciais

| Segredo                    | Onde obter                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`    | Token de **usuário do sistema** (Configurações do negócio → Usuários do sistema), com `whatsapp_business_messaging` e `whatsapp_business_management`. Não usar o token temporário de teste. |
| `WHATSAPP_PHONE_NUMBER_ID` | Painel do WhatsApp no app → *API Setup* → *Phone number ID*.              |
| `WHATSAPP_APP_SECRET`      | Configurações do app → Básico → Chave secreta do app.                     |
| `WHATSAPP_VERIFY_TOKEN`    | Texto aleatório escolhido por vocês (ex.: `openssl rand -hex 24`).        |
| `OWNER_WHATSAPP_NUMBER`    | Número pessoal da responsável, só dígitos com DDI (ex.: `5511999998888`). |

> O aviso que vale é o do painel: os itens **Pedidos** e **Atendimento** do
> menu mostram, em tempo real, quantos pedidos estão em "Recebido" e quantas
> conversas esperam atendimento (no celular, um ponto no botão de menu).
> O texto por WhatsApp à responsável é só uma tentativa extra, sem template:
> a Meta só entrega texto livre dentro da janela de 24 horas, então ele chega
> apenas se a responsável tiver mandado mensagem ao número da loja nas
> últimas 24 horas. Quando não chega, o erro fica no log da função e o
> cliente é atendido normalmente.

## 3. Segredos e deploy no Supabase

```sh
npx supabase secrets set --project-ref sgaedwkfxizcotdlaxjx \
  WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... OWNER_WHATSAPP_NUMBER=...

npx supabase functions deploy whatsapp-webhook --project-ref sgaedwkfxizcotdlaxjx
```

O `config.toml` já publica a função com `verify_jwt = false`: a Meta não envia
JWT do Supabase, e a função rejeita qualquer `POST` sem assinatura
`X-Hub-Signature-256` válida.

## 4. Webhook na Meta

1. No app → WhatsApp → *Configuration* → *Webhook*:
   - **Callback URL:** `https://sgaedwkfxizcotdlaxjx.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify token:** o mesmo `WHATSAPP_VERIFY_TOKEN`.
2. Assinar o campo **`messages`**.
3. Mandar "oi" para o número da loja. O bot responde com o menu, e a mensagem
   aparece em `whatsapp_inbound_messages` com status `processed`.

## 5. Acompanhamento

- **Logs:** painel do Supabase → Edge Functions → `whatsapp-webhook` → Logs.
- **Mensagens:** `whatsapp_inbound_messages.status` — `processed`, `ignored`
  (conversa em atendimento humano), `failed` (com `error`) ou `received`
  (execução interrompida; seção 5.9).
- **Reprocessamento:** depois de corrigir a causa de uma falha, chamar a função
  `reprocess-inbound` com a credencial de serviço (`service_role`, em Project
  Settings → API Keys). Ela só aceita essa chave; a chave pública leva `401`.

  ```sh
  # Seleção automática: até 20 mensagens `failed` ou presas em `received` há
  # mais de 5 minutos, com menos de 5 tentativas.
  curl -X POST https://sgaedwkfxizcotdlaxjx.supabase.co/functions/v1/reprocess-inbound \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY"

  # Mensagens específicas (ids de whatsapp_inbound_messages), mesmo acima do
  # limite de tentativas:
  curl -X POST https://sgaedwkfxizcotdlaxjx.supabase.co/functions/v1/reprocess-inbound \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{"ids": ["<uuid>"]}'
  ```

  A resposta lista o status final de cada mensagem. Publicar junto com o
  webhook: `npx supabase functions deploy reprocess-inbound --project-ref sgaedwkfxizcotdlaxjx`.
- **Atendimento humano:** a tela *Atendimento* do painel lista as conversas com
  o bot pausado e permite reativá-lo.

A versão da Graph API usada pela função fica em `GRAPH_API_VERSION`, em
`supabase/functions/_shared/whatsapp.ts`.

## 6. Frete pelo Melhor Envio (Fase 5)

Sem estes segredos o bot funciona normalmente: depois do CEP, avisa que não
conseguiu calcular o frete e segue para o resumo, e o pedido fica com o CEP e
o frete "não cotado".

| Segredo                    | Onde obter                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `MELHORENVIO_ACCESS_TOKEN` | Token gerado no painel do Melhor Envio (área de integrações / tokens de acesso), com permissão de cálculo de frete (`shipping-calculate`). Confira o caminho na [documentação atual](https://docs.melhorenvio.com.br). |
| `STORE_POSTAL_CODE`        | CEP de onde a loja despacha, só os 8 números.                             |
| `MELHORENVIO_USER_AGENT`   | Nome da aplicação e e-mail de contato, exigido pelo Melhor Envio: `Scrapbook Store (email@da-loja)`. |
| `MELHORENVIO_API_URL`      | Opcional. Padrão `https://melhorenvio.com.br`; para testes, `https://sandbox.melhorenvio.com.br` com um token gerado no sandbox. |

```sh
npx supabase secrets set --project-ref sgaedwkfxizcotdlaxjx \
  MELHORENVIO_ACCESS_TOKEN=... STORE_POSTAL_CODE=... \
  MELHORENVIO_USER_AGENT="Scrapbook Store (email@da-loja)"
```

A função lê os segredos a cada mensagem; não precisa publicar de novo.

- **Embalagem:** a cotação vai por produtos. Cada item leva peso e dimensões
  de envio cadastrados no painel, e o Melhor Envio monta as caixas. O valor
  segurado é o preço do produto. Por isso, peso e dimensões no cadastro devem
  ser os do produto já embalado.
- **Validade do token:** o token tem prazo de validade. Anote a data ao gerar
  e, antes de vencer, gere outro e rode o `secrets set` de novo. Token vencido
  aparece no log como `shipping: cotação falhou` com `Melhor Envio 401`.
- **Logs:** `shipping: cotação falhou` (erro da API ou timeout de 10 s),
  `shipping: nenhum serviço para o CEP` e `shipping: Melhor Envio não
  configurado`. Em todos os casos o cliente pode enviar a solicitação.
- **Cotações:** as opções mostradas ao cliente ficam em `shipping_quotes`; a
  escolhida aponta para o pedido (`order_id`).
