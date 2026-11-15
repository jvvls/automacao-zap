# Publicação, operação e recuperação (Fase 6)

Projeto Supabase de produção: `sgaedwkfxizcotdlaxjx`. Segredos do WhatsApp em
[`setup.md`](setup.md), seções 2 e 3; os do frete na seção 6.

## 1. Publicar

Ordem para uma instalação nova, ou para uma versão que muda o banco:

1. **Segredos** (`setup.md`, seções 3 e 6). A função os lê a cada mensagem.
2. **Migrations:** `npx supabase db push --project-ref sgaedwkfxizcotdlaxjx`.
3. **Funções:**
   `npx supabase functions deploy whatsapp-webhook reprocess-inbound --project-ref sgaedwkfxizcotdlaxjx`.
   Quando uma migration muda a assinatura de uma RPC (por exemplo,
   `20261115165847_order_shipping`), publique as duas funções logo depois de
   aplicar a migration: a versão antiga chama a RPC que deixou de existir.
4. **Webhook na Meta** (`setup.md`, seção 4).
5. **Painel** (seção 2 abaixo).
6. **Usuário administrativo** (seção 3 abaixo).

Numa distrobox, rode a CLI no host com o Docker real na frente do PATH
(`PATH=/usr/bin:$PATH npx supabase ...`), como no README.

## 2. Painel no GitHub Pages

O workflow `.github/workflows/admin-pages.yml` publica `apps/admin` a cada push
na `main` que muda o painel. Também roda pela aba *Actions* (*Run workflow*).

Configuração, uma vez só:

1. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. *Settings → Secrets and variables → Actions → Variables*, com os valores de
   *Project Settings → API Keys* no Supabase:
   - `VITE_SUPABASE_URL` = `https://sgaedwkfxizcotdlaxjx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = a chave pública (publishable/anon). Nunca a
     `service_role`.
3. No Supabase, *Authentication → URL Configuration → Site URL:* o endereço do
   Pages (`https://<usuário>.github.io/automacao-zap/`).

O painel fica em `/<repositório>/` (`vite build --base`). O Pages não reescreve
rotas: o workflow copia o `index.html` para `404.html`, e assim um link direto
para `/pedidos/<id>` abre o painel.

## 3. Usuário administrativo

O cadastro público fica desligado: *Authentication → Sign In / Providers →
Email*, opção "Allow new users to sign up" desmarcada (no local, isso já vem do
`config.toml`). Para criar a responsável:

1. *Authentication → Users → Add user → Create new user*, com e-mail, senha e
   "Auto Confirm User".
2. No *SQL Editor*:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'email@da-responsavel';
   ```

Sem a linha em `admins`, o login funciona, mas o painel não mostra nem altera
nada: as políticas RLS exigem `is_admin()`.

## 4. Rotina

- **Mensagens:** `whatsapp_inbound_messages.status` (`setup.md`, seção 5).
- **Atendimento humano:** a tela *Atendimento* do painel lista as conversas com
  o bot pausado e permite reativá-lo.
- **Token do Melhor Envio:** renovar antes do vencimento (`setup.md`, seção 6).
- **Token da Meta:** ao gerar o token de usuário do sistema, escolha a validade
  "Nunca" ou anote a data de vencimento. Token vencido ou revogado faz as
  respostas ao cliente falharem com `401` da Graph API.

## 5. Recuperação

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Meta mostra falhas de entrega do webhook; log com `whatsapp-webhook: erro` e resposta 500 | Banco indisponível ao registrar a mensagem, ou segredo ausente (`variável de ambiente ausente: ...`) | Corrija o segredo ou espere o banco voltar. A Meta reenvia o evento sozinha, e a deduplicação impede que ele seja processado duas vezes |
| Webhook responde 401 a tudo | `WHATSAPP_APP_SECRET` diferente do segredo do app na Meta | `secrets set` com o valor certo |
| Mensagens `failed` (com `error`) | Falha da Graph API, da RPC ou do banco durante o processamento | Corrija a causa e rode o `reprocess-inbound` (`setup.md`, seção 5) |
| Mensagens presas em `received` | Execução interrompida (limite de tempo da função, banco caiu no meio) | Depois de 5 minutos, a seleção automática do `reprocess-inbound` as inclui |
| Cliente recebe "não consegui calcular o frete" | Melhor Envio fora do ar, lento (> 10 s), token vencido ou segredos ausentes | Nada impede o pedido. Veja os logs `shipping:` e renove o token se for o caso |
| Bot parou de responder um cliente | `human_handoff` ligado para a conversa | Reative pela tela *Atendimento* |
| Nada responde e o painel não carrega dados | Projeto Supabase pausado por inatividade (plano gratuito) | *Restore project* no painel do Supabase. Para produção, avalie o plano pago (`architecture.md`, 11.4) |

Para recriar o ambiente do zero: migrations e funções estão no Git
(`supabase/`). Os segredos ficam nos painéis da Meta e do Melhor Envio
(`setup.md`), e os dados dependem do backup do plano Supabase em uso.
