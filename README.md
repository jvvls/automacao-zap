# Scrapbook Store — automação de pedidos pelo WhatsApp

Arquitetura e plano: [`docs/architecture.md`](docs/architecture.md).
Configuração do WhatsApp: [`docs/setup.md`](docs/setup.md).
Publicação, operação e recuperação: [`docs/operacao.md`](docs/operacao.md).

## Estrutura

- `apps/admin/` — painel (React + TypeScript + Vite).
- `supabase/migrations/` — schema, RLS, RPCs e Storage, versionados.
- `supabase/functions/` — Edge Functions (Deno/TypeScript).
- `supabase/tests/database/` — testes pgTAP do banco.
- `supabase/seed.sql` — dados fictícios, aplicados só no ambiente local.

## Ambiente local

Requer Node 22+ e Docker. A CLI do Supabase roda via `npx supabase`, na versão
fixada no `package.json` da raiz (`npm install` na raiz uma vez).

> Numa distrobox, rode a CLI do Supabase no **host**, com o Docker real
> primeiro no PATH (`PATH=/usr/bin:$PATH npx supabase start`). Pelo shim
> `distrobox-host-exec`, o container do Postgres sobe sem `POSTGRES_PASSWORD`.

```sh
npx supabase start                 # sobe o stack local e aplica migrations + seed
npx supabase db reset              # recria o banco local do zero
npx supabase test db               # roda os testes pgTAP
npx supabase functions serve       # serve as Edge Functions locais

cd apps/admin
cp ../../.env.example .env.local   # preencher com a URL e a chave de `npx supabase status`
npm install
npm run dev
npx playwright install chromium    # uma vez, para os testes e2e
npm run test:e2e                   # testes do painel contra o Supabase local com seed
```

Usuário administrativo do seed local: `admin@scrapbook.local` / `admin123456`.

### Testes das Edge Functions

O Deno vem do `package.json` da raiz (`npm install` uma vez).

```sh
npm run test:functions             # unitários: máquina de estados, carrinho, frete e formatos da Meta

# integrado: webhook servido com segredos falsos, uma Graph API falsa na porta
# 54400 e um Melhor Envio falso na porta 54401; inclui o teste de banco fora
# do ar (supabase-down.test.ts), que não depende das funções servidas
npx supabase functions serve --env-file supabase/functions/.env.test
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY de `npx supabase status -o env`> \
  npm run test:functions:integration
```

## Convenções

- **Banco:** nomes em inglês, `snake_case`, tabelas no plural. Toda mudança de
  schema é uma migration nova em `supabase/migrations/`; migrations já
  aplicadas não são editadas.
- **Segurança:** RLS ligado em todas as tabelas de `public`. Acesso do painel só
  via `is_admin()`. RPCs internas executáveis apenas por `service_role`.
- **TypeScript:** `strict`, sem `any`. Painel e Edge Functions usam a mesma
  linguagem.
- **Segredos:** nunca versionados. Ver `.env.example`.
- **Commits:** Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`,
  `chore`, ...), uma tarefa por commit.
