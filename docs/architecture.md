# Scrapbook Store --- Documento de Arquitetura e Plano de Implementação do MVP

**Versão:** 1.2\
**Data:** 15/11/2026\
**Status:** Proposta técnica para implementação

> **Alterações da versão 1.2:** uma conversa por cliente
> (`UNIQUE(customer_id)`, com reset por inatividade); tabela `admins` e
> função `is_admin()` para o RLS; bucket de imagens público com escrita
> restrita; `human_handoff` como única fonte de verdade do atendimento
> humano (estado `HUMAN_HANDOFF` removido); `CHECK` nos status;
> `products.category_id` obrigatório; trigger de `updated_at`;
> reprocessamento de mensagens presas em `received`.

> **Alterações da versão 1.1:** a orquestração com n8n self-hosted foi
> substituída por **Supabase Edge Functions** (TypeScript/Deno). Com
> isso, o MVP deixa de precisar de VPS, containers ou qualquer servidor
> permanente: banco, autenticação, imagens e automação ficam todos no
> Supabase. Foram atualizadas as seções 1, 2, 3, 7, 9, 10, 11, 12, 13,
> 14, 15, 17 e 18, e foi criada a tabela `whatsapp_inbound_messages`
> (seção 5.9).

## 1. Objetivo

Construir uma solução pequena para apoiar a venda de produtos artesanais
de scrapbook pelo WhatsApp.

O cliente deverá conseguir:

1.  Iniciar uma conversa com a loja pelo WhatsApp.
2.  Navegar pelo catálogo e consultar produtos disponíveis.
3.  Selecionar produtos e quantidades.
4.  Consultar uma estimativa de frete, quando aplicável.
5.  Enviar uma solicitação de pedido.
6.  Escolher falar diretamente com a responsável pela loja.

A responsável pela loja deverá conseguir:

1.  Cadastrar, editar e desativar produtos.
2.  Informar preço, descrição, fotos, peso e dimensões de envio de cada
    produto.
3.  Consultar as solicitações recebidas.
4.  Atualizar o andamento de cada solicitação.

O sistema não deve tentar substituir o atendimento humano nem
automatizar toda a operação comercial. O WhatsApp será o canal de
entrada e a automação organizará as informações antes de encaminhar a
solicitação à responsável.

## 2. Princípios e limites do MVP

### 2.1. Princípios

-   **Simplicidade operacional:** a responsável pela loja deve conseguir
    usar o painel sem conhecimento técnico, e o sistema não deve exigir
    manutenção de servidores.
-   **Poucas funcionalidades, bem executadas:** implementar somente o
    necessário para catálogo, solicitação de pedido, frete e gestão
    básica.
-   **Uma fonte de verdade:** os dados de produtos e pedidos ficam no
    PostgreSQL do Supabase.
-   **Automação determinística:** a conversa inicial utiliza menus e
    opções controladas, sem depender de IA generativa.
-   **Sem servidor próprio:** o painel acessa o Supabase pelo SDK
    oficial, com políticas RLS. As integrações (WhatsApp e Melhor Envio)
    e a lógica da conversa rodam em Supabase Edge Functions, que são
    serverless e gerenciadas pelo Supabase.
-   **Execuções curtas e sem estado em memória:** cada execução de Edge
    Function trata um evento e termina. Todo estado necessário (conversa,
    carrinho, deduplicação, falhas) fica no banco.
-   **Atendimento humano sempre disponível:** o cliente pode solicitar
    contato direto com a responsável.
-   **Dados logísticos no cadastro:** cada produto deve ter peso e
    dimensões de envio cadastrados.

### 2.2. Fora do escopo

Não implementar no MVP:

-   Personalização ou configuração de variantes de produtos.
-   Pagamento online ou integração com gateway de pagamento.
-   Controle de estoque ou matéria-prima.
-   Emissão de nota fiscal.
-   Programa de fidelidade, cupons ou campanhas.
-   Inteligência artificial no atendimento.
-   CRM ou segmentação de clientes.
-   Relatórios analíticos avançados.
-   Múltiplos usuários administrativos ou múltiplas lojas.
-   Integração com marketplaces.
-   Rastreamento automático de encomendas.
-   Algoritmo avançado de empacotamento.
-   Aplicativo mobile nativo.
-   Ferramenta visual de automação (n8n, Make, Zapier etc.).

## 3. Visão geral da arquitetura

### 3.1. Componentes

| Componente            | Tecnologia                                        | Responsabilidade                                                 |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Canal de atendimento  | WhatsApp Business Platform --- Cloud API          | Receber e enviar mensagens                                       |
| Automação e integrações | Supabase Edge Functions (TypeScript/Deno)       | Receber webhooks, conduzir a conversa, cotar frete, notificar    |
| Banco de dados        | Supabase PostgreSQL                               | Armazenar catálogo, clientes, conversas, pedidos e cotações      |
| Autenticação          | Supabase Auth                                     | Autenticar a responsável no painel                               |
| Imagens               | Supabase Storage                                  | Armazenar fotos dos produtos                                     |
| Painel administrativo | React + TypeScript                                | Gerenciar produtos e pedidos                                     |
| Cotação de frete      | API Melhor Envio                                  | Consultar opções de transporte                                   |
| Hospedagem do painel  | Serviço de hospedagem estática compatível         | Publicar a aplicação React                                       |
| Hospedagem da automação | Supabase (gerenciado)                           | Executar as Edge Functions sob demanda; não há VPS               |

### 3.2. Diagrama lógico

``` text
                         CLIENTE
                            |
                            v
                     WHATSAPP CLOUD API
                            |
                     Webhook (HTTPS)
                            |
                            v
        +---------------------------------------------+
        |            SUPABASE EDGE FUNCTIONS          |
        |                                             |
        |  whatsapp-webhook                           |
        |    ├── catálogo        ├── pedidos          |
        |    ├── carrinho        ├── atendimento      |
        |    └── frete ----------+---> MELHOR ENVIO   |
        +---------------------------------------------+
                            |
                            v
                    SUPABASE API / DB
                      /           \
                     v             v
               PostgreSQL      Storage
                     ^
                     |
              Supabase SDK
                     |
                     v
              PAINEL REACT
                     |
                     v
             RESPONSÁVEL PELA LOJA
```

O painel React acessa o Supabase diretamente pelo SDK. Não haverá uma
API REST própria para o painel no MVP.

As Edge Functions acessam o banco pelo cliente Supabase (`supabase-js`)
com credencial de serviço, e usam funções RPC (PostgreSQL) sempre que uma
operação exigir consistência transacional.

### 3.3. Responsabilidade de cada componente

**React**

-   Renderizar o painel.
-   Autenticar a responsável.
-   Cadastrar, editar e desativar produtos.
-   Exibir solicitações de pedido.
-   Permitir atualização do status dos pedidos.
-   Permitir reativar o bot em conversas em atendimento humano.

**Supabase (banco, Auth e Storage)**

-   Persistir todos os dados da aplicação.
-   Garantir relacionamentos e integridade referencial.
-   Aplicar autorização por RLS.
-   Autenticar o acesso administrativo.
-   Armazenar imagens.

**Supabase Edge Functions**

-   Receber e verificar eventos do WhatsApp.
-   Deduplicar mensagens recebidas.
-   Recuperar e atualizar o estado da conversa.
-   Consultar o catálogo.
-   Conduzir a seleção de produtos e quantidades.
-   Consultar frete no Melhor Envio quando solicitado.
-   Registrar a solicitação de pedido (via RPC transacional).
-   Notificar a responsável.
-   Permitir a transferência para atendimento humano.
-   Registrar falhas de processamento para análise e reprocessamento.

**WhatsApp Cloud API**

-   Receber mensagens e eventos.
-   Enviar textos, imagens, listas e botões interativos compatíveis.
-   Receber respostas dos menus.
-   Enviar mensagens de confirmação e atualização, respeitando as regras
    da plataforma.

**Melhor Envio**

-   Receber CEP de origem, CEP de destino e dados de pacote/produtos.
-   Retornar serviços disponíveis, preços e prazos estimados.
-   Não realizar compra de etiqueta no MVP.

### 3.4. Por que Edge Functions em vez de n8n

| Aspecto                  | n8n self-hosted (v1.0)                     | Edge Functions (v1.1)                                  |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| Infraestrutura           | VPS, container, HTTPS, atualizações        | Gerenciada pelo Supabase                               |
| Custo fixo               | VPS mensal                                 | Incluído no plano Supabase (dentro dos limites)        |
| Versionamento            | Export de JSON dos workflows               | Código TypeScript no Git                               |
| Testes                   | Manuais, pelo editor                       | Testes automatizados (`deno test`) da lógica da conversa |
| Histórico de execuções   | Nativo do n8n                              | Logs do Supabase + tabela própria de mensagens/falhas  |
| Edição sem programar     | Possível                                   | Exige alteração de código                              |

A perda principal é o histórico visual de execuções e a possibilidade de
reexecutar um evento pela interface. Isso é compensado pela tabela
`whatsapp_inbound_messages` (seção 5.9), que guarda o status de cada
evento e permite reprocessamento manual.

### 3.5. Limites das Edge Functions

As Edge Functions têm limites de memória, de duração da execução e de
tempo de CPU por requisição, que variam conforme o plano. Os valores
atuais devem ser conferidos na documentação oficial (seção 18) antes da
implementação.

Para este MVP, os limites não são um problema, desde que:

-   Cada execução trate **um evento** (uma mensagem recebida) e termine.
-   Chamadas externas (Meta, Melhor Envio) tenham **timeout explícito**
    (por exemplo, com `AbortController`). Espera de I/O não consome CPU
    como processamento, mas uma API lenta não pode segurar a execução
    indefinidamente.
-   Nenhuma operação dependa de manter estado em memória entre
    execuções.
-   Operações demoradas ou em lote, se surgirem no futuro, sejam
    divididas em etapas persistidas no banco (por exemplo, com fila ou
    agendamento), e não executadas numa única chamada.

## 4. Fluxos funcionais

### 4.1. Primeiro contato e menu principal

1.  O cliente envia uma mensagem ao número da loja.
2.  A Meta encaminha o evento à Edge Function `whatsapp-webhook`.
3.  A função verifica a assinatura do evento e registra a mensagem para
    deduplicação.
4.  A função identifica o número de telefone do cliente.
5.  O sistema localiza ou cria o cadastro do cliente.
6.  O sistema recupera ou inicia a conversa.
7.  A função apresenta o menu principal.

Opções mínimas:

-   Ver catálogo.
-   Consultar um pedido.
-   Falar com a responsável.

A opção de consulta de pedido pode ser implementada de forma simples,
mostrando os pedidos recentes associados ao telefone do remetente e seus
status. Não deve expor dados de outros clientes.

### 4.2. Navegação pelo catálogo

1.  O cliente escolhe "Ver catálogo".
2.  O sistema consulta as categorias que possuem produtos ativos.
3.  O cliente seleciona uma categoria.
4.  O sistema consulta os produtos ativos daquela categoria.
5.  O sistema apresenta os produtos com nome, preço e foto, quando
    disponível.
6.  O cliente seleciona um produto.
7.  O sistema apresenta descrição e preço.
8.  O cliente informa a quantidade.
9.  O item é adicionado ao carrinho temporário da conversa.
10. O cliente pode continuar escolhendo produtos ou revisar o pedido.

O catálogo deve refletir os dados atuais do banco. Produtos inativos não
podem aparecer para novos pedidos.

### 4.3. Carrinho e solicitação de pedido

O carrinho é um estado temporário da conversa, persistido no campo de
contexto da conversa para permitir que o cliente retome o fluxo.

O cliente poderá:

-   Adicionar produtos.
-   Alterar quantidades.
-   Remover itens.
-   Revisar o resumo.
-   Informar o CEP de destino para cotação de frete.
-   Enviar a solicitação.

Ao confirmar o envio da solicitação:

1.  A função chama a RPC `create_order_with_items`.
2.  A RPC valida se os produtos continuam ativos.
3.  A RPC recupera os preços atuais e calcula o subtotal.
4.  Se houver cotação de frete válida, registra o valor estimado e o
    serviço escolhido.
5.  O pedido é criado no banco, junto com seus itens.
6.  O sistema envia uma confirmação ao cliente.
7.  A responsável recebe uma notificação com os dados do pedido.

O envio da solicitação **não representa confirmação definitiva da
venda**. A responsável ainda deverá validar disponibilidade, frete,
prazo e valor final.

### 4.4. Atendimento humano

Quando o cliente selecionar "Falar com a responsável":

1.  A conversa recebe `human_handoff = true`.
2.  O sistema registra a data da transferência.
3.  A responsável recebe uma notificação contendo o telefone e o
    contexto disponível.
4.  O bot deixa de responder automaticamente àquela conversa enquanto o
    atendimento humano estiver ativo.

A responsável poderá retomar o fluxo automatizado pelo painel, por uma
ação administrativa simples (atualização de `human_handoff` permitida
por RLS). Ao reativar, a conversa volta a `MAIN_MENU` e `handoff_at`
é limpo. Se essa ação não couber na primeira entrega, a reativação
poderá ser feita diretamente no registro da conversa durante a operação
inicial.

**Limite operacional importante:** o painel não é uma interface de chat.
No MVP, a responsável continua a conversa pelo aplicativo WhatsApp
Business. O sistema apenas suspende as respostas automáticas para evitar
conflito entre bot e pessoa.

> Verificar, na configuração do número, se o uso simultâneo da Cloud API
> e do aplicativo WhatsApp Business no mesmo número é suportado na
> modalidade contratada (coexistência). Se não for, definir antes da
> Fase 3 como a responsável atenderá as conversas transferidas.

### 4.5. Cotação de frete

O cliente informa o CEP de destino. O sistema utiliza o CEP de origem
configurado para a loja e os dados logísticos cadastrados nos produtos.

Fluxo:

1.  Validar o CEP de destino.
2.  Consultar os itens e suas quantidades.
3.  Recuperar peso e dimensões de envio dos produtos no banco (nunca a
    partir de dados enviados pelo cliente).
4.  Determinar os dados de pacote para a cotação.
5.  Consultar a API do Melhor Envio, com timeout.
6.  Apresentar opções disponíveis, preços e prazos.
7.  Registrar a opção selecionada no contexto da conversa e,
    posteriormente, no pedido.

**Limitação de empacotamento:** somar dimensões de produtos não produz
dimensões corretas de uma caixa. No MVP, deve ser adotada uma regra
operacional simples e documentada. Se a loja utilizar uma embalagem
padrão, cadastrar suas dimensões e cotar com essa embalagem, desde que
seja adequada aos itens. Se os pedidos variarem muito de tamanho,
apresentar a cotação como estimativa sujeita à validação manual da
responsável.

Não comprar etiquetas nem automatizar despacho no MVP.

## 5. Modelagem de dados

A modelagem deve ser pequena, relacional e suficiente para os fluxos
descritos.

Toda tabela com `updated_at` recebe um trigger `BEFORE UPDATE` que grava
`now()` nessa coluna. O controle de concorrência da seção 5.4 depende
disso.

### 5.1. `categories`

Armazena as categorias exibidas no catálogo.

| Campo        | Tipo         | Regras                          |
| ------------ | ------------ | ------------------------------- |
| `id`         | UUID         | PK, default `gen_random_uuid()` |
| `name`       | VARCHAR(100) | NOT NULL, UNIQUE                |
| `active`     | BOOLEAN      | NOT NULL, default `true`        |
| `created_at` | TIMESTAMPTZ  | NOT NULL, default `now()`       |

Não é necessário criar uma interface complexa para categorias. No
painel, a responsável pode selecionar uma categoria existente e, se
necessário, cadastrar uma nova.

### 5.2. `products`

Armazena os produtos disponíveis.

| Campo                | Tipo          | Regras                         |
| -------------------- | ------------- | ------------------------------ |
| `id`                 | UUID          | PK                             |
| `category_id`        | UUID          | FK para `categories.id`, NOT NULL |
| `name`               | VARCHAR(150)  | NOT NULL                       |
| `description`        | TEXT          | Opcional                       |
| `base_price`         | NUMERIC(10,2) | NOT NULL, \> 0                 |
| `image_path`         | TEXT          | Caminho do arquivo no Storage  |
| `shipping_weight_kg` | NUMERIC(8,3)  | NOT NULL, \> 0                 |
| `shipping_width_cm`  | NUMERIC(8,2)  | NOT NULL, \> 0                 |
| `shipping_height_cm` | NUMERIC(8,2)  | NOT NULL, \> 0                 |
| `shipping_length_cm` | NUMERIC(8,2)  | NOT NULL, \> 0                 |
| `active`             | BOOLEAN       | NOT NULL, default `true`       |
| `created_at`         | TIMESTAMPTZ   | NOT NULL, default `now()`      |
| `updated_at`         | TIMESTAMPTZ   | NOT NULL, default `now()`      |

Os campos `shipping_*` representam as dimensões e o peso usados para
expedição --- preferencialmente do produto já acondicionado ou de sua
embalagem individual --- e não apenas as medidas artesanais do objeto.

Unidades:

-   Peso: quilogramas.
-   Dimensões: centímetros.
-   Preço: reais.

Um produto não deve ser publicado no catálogo sem preço e dados
logísticos válidos. A imagem pode ser opcional.

### 5.3. `customers`

Armazena os clientes identificados pelo WhatsApp.

| Campo        | Tipo         | Regras                    |
| ------------ | ------------ | ------------------------- |
| `id`         | UUID         | PK                        |
| `name`       | VARCHAR(150) | Opcional                  |
| `phone`      | VARCHAR(30)  | NOT NULL, UNIQUE          |
| `created_at` | TIMESTAMPTZ  | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ  | NOT NULL, default `now()` |

O telefone deve ser normalizado em formato internacional, incluindo
código do país.

### 5.4. `conversations`

Armazena o estado da conversa para que o cliente possa continuar o
atendimento posteriormente.

| Campo                 | Tipo        | Regras                           |
| --------------------- | ----------- | -------------------------------- |
| `id`                  | UUID        | PK                               |
| `customer_id`         | UUID        | FK para `customers.id`, NOT NULL, UNIQUE |
| `current_state`       | VARCHAR(50) | NOT NULL, CHECK nos estados da seção 8   |
| `context`             | JSONB       | NOT NULL, default `{}`           |
| `human_handoff`       | BOOLEAN     | NOT NULL, default `false`        |
| `handoff_at`          | TIMESTAMPTZ | Opcional                         |
| `last_interaction_at` | TIMESTAMPTZ | NOT NULL, default `now()`        |
| `updated_at`          | TIMESTAMPTZ | NOT NULL, default `now()`        |

Cada cliente tem **uma única linha** de conversa, garantida por
`UNIQUE(customer_id)`. Quando a última interação for mais antiga que o
limite de inatividade (por exemplo, 24 horas), a próxima mensagem
reinicia a conversa: `current_state` volta a `MAIN_MENU` e `context`
volta a `{}`. O reset não altera `human_handoff`. O histórico fica em
`orders` e `whatsapp_inbound_messages`, não em linhas antigas de
conversa.

O `context` pode conter o carrinho temporário, categoria selecionada,
produto selecionado, CEP e cotação ainda não convertida em pedido.

Não utilizar o contexto como substituto das tabelas definitivas de
pedidos e itens.

**Concorrência:** como cada mensagem é tratada por uma execução
independente, duas mensagens do mesmo cliente podem ser processadas ao
mesmo tempo. A atualização de estado deve usar controle otimista (por
exemplo, `UPDATE ... WHERE id = $1 AND updated_at = $2`) ou uma RPC com
`SELECT ... FOR UPDATE`, para que uma execução não sobrescreva o estado
gravado pela outra.

### 5.5. `orders`

Armazena solicitações de pedido.

| Campo                     | Tipo          | Regras                           |
| ------------------------- | ------------- | -------------------------------- |
| `id`                      | UUID          | PK                               |
| `customer_id`             | UUID          | FK para `customers.id`, NOT NULL |
| `status`                  | VARCHAR(30)   | NOT NULL, CHECK nos status abaixo |
| `subtotal`                | NUMERIC(10,2) | NOT NULL, \>= 0                  |
| `shipping_cost`           | NUMERIC(10,2) | Opcional                         |
| `total_estimated`         | NUMERIC(10,2) | Opcional                         |
| `destination_postal_code` | VARCHAR(10)   | Opcional                         |
| `shipping_service`        | VARCHAR(100)  | Opcional                         |
| `notes`                   | TEXT          | Opcional                         |
| `idempotency_key`         | VARCHAR(100)  | UNIQUE, opcional                 |
| `created_at`              | TIMESTAMPTZ   | NOT NULL, default `now()`        |
| `updated_at`              | TIMESTAMPTZ   | NOT NULL, default `now()`        |

O `idempotency_key` protege contra a criação duplicada do mesmo pedido
(por exemplo, derivado do identificador da mensagem de confirmação ou de
um identificador do carrinho guardado no contexto).

Status mínimos sugeridos:

-   `received`: solicitação recebida.
-   `in_review`: em análise pela responsável.
-   `approved`: orçamento/pedido aprovado.
-   `in_production`: em produção.
-   `ready`: pronto.
-   `completed`: concluído.
-   `cancelled`: cancelado.

Não criar fluxo financeiro ou de pagamento neste MVP.

### 5.6. `order_items`

Armazena os produtos e quantidades de cada pedido.

| Campo                   | Tipo          | Regras                          |
| ----------------------- | ------------- | ------------------------------- |
| `id`                    | UUID          | PK                              |
| `order_id`              | UUID          | FK para `orders.id`, NOT NULL   |
| `product_id`            | UUID          | FK para `products.id`, NOT NULL |
| `product_name_snapshot` | VARCHAR(150)  | NOT NULL                        |
| `unit_price_snapshot`   | NUMERIC(10,2) | NOT NULL                        |
| `quantity`              | INTEGER       | NOT NULL, \> 0                  |
| `created_at`            | TIMESTAMPTZ   | NOT NULL, default `now()`       |

O nome e o preço devem ser copiados no momento da criação do pedido.
Isso preserva o histórico mesmo se o produto for editado ou desativado.

### 5.7. `shipping_quotes`

Armazena as cotações apresentadas ao cliente.

| Campo                     | Tipo          | Regras                        |
| ------------------------- | ------------- | ----------------------------- |
| `id`                      | UUID          | PK                            |
| `conversation_id`         | UUID          | FK para `conversations.id`    |
| `order_id`                | UUID          | FK para `orders.id`, opcional |
| `provider`                | VARCHAR(50)   | NOT NULL                      |
| `service_name`            | VARCHAR(100)  | NOT NULL                      |
| `price`                   | NUMERIC(10,2) | NOT NULL                      |
| `delivery_days`           | INTEGER       | Opcional                      |
| `destination_postal_code` | VARCHAR(10)   | NOT NULL                      |
| `expires_at`              | TIMESTAMPTZ   | Opcional                      |
| `created_at`              | TIMESTAMPTZ   | NOT NULL, default `now()`     |

A cotação deve ser tratada como estimativa. Preço e prazo podem mudar
até a contratação efetiva do frete.

### 5.8. `order_status_history`

Registra alterações de status.

| Campo             | Tipo        | Regras                        |
| ----------------- | ----------- | ----------------------------- |
| `id`              | UUID        | PK                            |
| `order_id`        | UUID        | FK para `orders.id`, NOT NULL |
| `previous_status` | VARCHAR(30) | Opcional, mesmo CHECK de `orders.status` |
| `new_status`      | VARCHAR(30) | NOT NULL, mesmo CHECK de `orders.status` |
| `created_at`      | TIMESTAMPTZ | NOT NULL, default `now()`     |

O histórico pode ser preenchido por um trigger ou função SQL executada
sempre que o status do pedido for alterado.

### 5.9. `whatsapp_inbound_messages`

Garante a deduplicação de eventos da Meta e substitui o histórico de
execuções que antes viria do n8n.

| Campo                 | Tipo        | Regras                                          |
| --------------------- | ----------- | ----------------------------------------------- |
| `id`                  | UUID        | PK                                              |
| `wa_message_id`       | VARCHAR(100)| NOT NULL, UNIQUE                                |
| `phone`               | VARCHAR(30) | NOT NULL                                        |
| `conversation_id`     | UUID        | FK para `conversations.id`, opcional            |
| `payload`             | JSONB       | NOT NULL (evento recebido, para reprocessamento)|
| `status`              | VARCHAR(20) | NOT NULL: `received`, `processed`, `ignored`, `failed` |
| `error`               | TEXT        | Opcional                                        |
| `attempts`            | INTEGER     | NOT NULL, default `0`                           |
| `received_at`         | TIMESTAMPTZ | NOT NULL, default `now()`                       |
| `processed_at`        | TIMESTAMPTZ | Opcional                                        |

A inserção com `wa_message_id` único é a barreira de idempotência: se a
inserção falhar por violação de unicidade, o evento já foi recebido e
deve ser ignorado.

Como o webhook responde `200` antes de terminar o processamento, uma
execução interrompida pode deixar a mensagem em `received` para sempre.
Mensagens em `received` com `received_at` mais antigo que alguns minutos
devem ser tratadas como falhas e entrar no reprocessamento junto com as
`failed` (seção 11.3).

Como `payload` contém dados pessoais e conteúdo de mensagens, definir
uma retenção curta (por exemplo, apagar ou limpar o `payload` de
mensagens processadas após alguns dias, com um job agendado via
`pg_cron`). Esta tabela não deve ser acessível pelo painel.

### 5.10. `admins`

Identifica os usuários do Supabase Auth que podem administrar a loja.

| Campo        | Tipo        | Regras                              |
| ------------ | ----------- | ----------------------------------- |
| `user_id`    | UUID        | PK, FK para `auth.users.id`         |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()`           |

A função `is_admin()` (`SECURITY DEFINER`, `STABLE`) retorna `true` se
`auth.uid()` estiver em `admins`. Todas as políticas RLS
administrativas e as políticas de escrita do Storage usam essa função.
A tabela não é editável pelo painel: o registro da responsável é
inserido por migration ou seed. O cadastro público do Supabase Auth fica
desligado.

### 5.11. Relacionamentos

``` text
categories 1 -------- N products

customers  1 -------- N conversations
customers  1 -------- N orders

conversations 1 ----- N shipping_quotes
conversations 1 ----- N whatsapp_inbound_messages

orders 1 ------------ N order_items
orders 1 ------------ N order_status_history
orders 1 ------------ N shipping_quotes (opcional)
```

### 5.12. Operações que devem ser transacionais

A criação de um pedido precisa garantir que o pedido e seus itens sejam
persistidos juntos.

Implementar uma função PostgreSQL, por exemplo
`create_order_with_items`, chamada pela Edge Function via RPC, que:

1.  Receba o cliente, os itens selecionados e a chave de idempotência.
2.  Retorne o pedido existente se a chave já tiver sido usada.
3.  Valide os produtos e quantidades.
4.  Leia os preços atuais no banco.
5.  Crie o pedido.
6.  Crie os itens com nome e preço históricos.
7.  Registre o status inicial.
8.  Retorne o identificador do pedido.

Se qualquer etapa falhar, a transação inteira deve ser revertida.

A função não deve confiar em preços enviados pelo cliente, pela Edge
Function ou pelo frontend. O valor deve ser obtido do banco.

A função deve ser executável apenas pelo papel de serviço (revogar
`EXECUTE` de `anon` e `authenticated`), já que o painel não cria
pedidos.

## 6. Painel administrativo

### 6.1. Requisitos de interface

O painel deve ser responsivo, com prioridade para uso em celular.

Não construir um dashboard analítico. A interface deve priorizar as duas
tarefas frequentes: cadastrar produtos e acompanhar pedidos.

### 6.2. Tela de produtos

Funcionalidades:

-   Listar produtos.
-   Cadastrar produto.
-   Editar produto.
-   Ativar/desativar produto.
-   Enviar ou substituir foto.
-   Selecionar ou cadastrar categoria.

Campos do formulário:

**Informações do produto**

-   Nome.
-   Categoria.
-   Descrição.
-   Preço.
-   Foto.

**Informações para envio**

-   Peso em kg.
-   Largura em cm.
-   Altura em cm.
-   Comprimento em cm.

A validação deve impedir valores negativos, dimensões zeradas e
publicação de produtos sem os dados obrigatórios.

### 6.3. Tela de pedidos

Exibir uma lista simples contendo:

-   Identificador do pedido.
-   Nome do cliente.
-   Data.
-   Valor estimado.
-   Status.

Ao abrir um pedido, exibir:

-   Telefone do cliente.
-   Produtos e quantidades.
-   Preços registrados no pedido.
-   CEP de destino, se informado.
-   Cotação de frete selecionada, se houver.
-   Data de criação.
-   Histórico de status.

A responsável poderá alterar o status por uma seleção simples.

### 6.4. Autenticação e permissões

-   Utilizar Supabase Auth.
-   Criar apenas o usuário administrativo necessário ao MVP.
-   Proteger todas as rotas do painel.
-   Habilitar RLS nas tabelas expostas pela API.
-   Permitir operações administrativas somente ao usuário autorizado,
    verificado por `is_admin()` (seção 5.10).
-   Desligar o cadastro público no Supabase Auth.
-   Não disponibilizar a chave de serviço (`service_role` / secret key)
    no navegador.

As fotos ficam em um bucket **público**, porque as imagens do catálogo
não são sigilosas e o WhatsApp precisa de uma URL estável para enviá-las.
Upload, substituição e remoção de arquivos são permitidos somente quando
`is_admin()` for verdadeiro.

As Edge Functions usam a credencial de serviço disponibilizada pelo
próprio ambiente do Supabase, e os demais segredos ficam em Edge
Function Secrets (seção 15). Nenhuma função deve expor operações
administrativas a quem chama.

## 7. Organização das Edge Functions

O código das funções fica em `supabase/functions/`, versionado no Git e
publicado com a Supabase CLI.

A automação é organizada em **poucas funções HTTP** e **módulos
compartilhados** de domínio. Os antigos workflows WF-01 a WF-06 passam a
ser módulos TypeScript chamados diretamente pela função de webhook, sem
chamadas HTTP entre funções. Isso evita latência extra, autenticação
entre funções e falhas parciais.

``` text
supabase/functions/
├── whatsapp-webhook/      # função HTTP: entrada de eventos da Meta
│   └── index.ts
├── calculate-shipping/    # função HTTP opcional: cotação isolada (testes/painel)
│   └── index.ts
└── _shared/               # módulos importados pelas funções
    ├── supabase.ts        # cliente com credencial de serviço
    ├── whatsapp.ts        # envio de mensagens, verificação de assinatura
    ├── state-machine.ts   # transições de estado (lógica pura, testável)
    ├── catalog.ts
    ├── cart.ts
    ├── orders.ts
    ├── shipping.ts        # integração Melhor Envio + regra de embalagem
    ├── handoff.ts
    ├── order-status.ts
    └── notify.ts          # notificação à responsável
```

### EF-01 --- `whatsapp-webhook` (entrada de mensagens)

Responsabilidade: receber, verificar, deduplicar e rotear eventos da
Meta.

Configuração: publicar **sem verificação de JWT** do Supabase
(`verify_jwt = false` em `config.toml` ou `--no-verify-jwt` no deploy),
pois a Meta não envia token do Supabase. A autenticidade é garantida
pela verificação da assinatura da Meta.

Etapas:

1.  `GET`: responder à verificação inicial do webhook (comparar
    `hub.verify_token` com o segredo configurado e devolver
    `hub.challenge`).
2.  `POST`: validar a assinatura `X-Hub-Signature-256` com o App Secret,
    usando o corpo bruto da requisição. Rejeitar se inválida.
3.  Ignorar eventos que não sejam mensagens relevantes (por exemplo,
    eventos de status de entrega).
4.  Extrair identificador da mensagem, telefone e conteúdo.
5.  Inserir em `whatsapp_inbound_messages`; se já existir, responder
    `200` e encerrar.
6.  Responder `200` à Meta rapidamente e continuar o processamento em
    segundo plano (`EdgeRuntime.waitUntil`), ou processar de forma
    síncrona se o tempo total for curto o suficiente.
7.  Localizar ou criar cliente.
8.  Localizar ou iniciar conversa.
9.  Se `human_handoff = true`, marcar a mensagem como `ignored` e não
    responder.
10. Encaminhar para o módulo correspondente ao estado atual.
11. Marcar a mensagem como `processed` ou `failed` (com o erro).

> Ao responder `200` antes de terminar o processamento, a Meta não
> reenviará o evento em caso de falha posterior. Por isso, a falha deve
> ficar registrada em `whatsapp_inbound_messages` para reprocessamento
> manual (seção 11.3).

### Módulo `catalog` (antigo WF-02 --- Menu e catálogo)

1.  Consultar categorias ativas.
2.  Enviar menu de categorias.
3.  Receber escolha.
4.  Consultar produtos ativos da categoria.
5.  Apresentar produtos.
6.  Enviar detalhes do produto selecionado.
7.  Solicitar quantidade.
8.  Atualizar carrinho no contexto da conversa.

### Módulos `cart` e `orders` (antigo WF-03 --- Carrinho e pedido)

1.  Exibir itens e quantidades.
2.  Permitir alterar quantidade ou remover item.
3.  Solicitar CEP se o cliente quiser cotar frete.
4.  Exibir resumo.
5.  Solicitar confirmação do envio da solicitação.
6.  Chamar a RPC `create_order_with_items` com chave de idempotência.
7.  Limpar o carrinho da conversa.
8.  Enviar confirmação ao cliente.
9.  Notificar a responsável.

### Módulo `shipping` e função `calculate-shipping` (antigo WF-04 --- Cotação de frete)

O módulo `shipping` é chamado diretamente pelo webhook no fluxo da
conversa. A função HTTP `calculate-shipping` é opcional: expõe a mesma
lógica para testes ou para uso futuro no painel, protegida por JWT da
responsável.

Entrada da função (exemplo):

``` json
{
  "cep": "30140071",
  "items": [
    { "product_id": "abc123", "quantity": 2 }
  ]
}
```

Etapas:

1.  Receber CEP e itens (apenas identificadores e quantidades).
2.  Buscar peso e dimensões dos produtos no banco e validá-los.
3.  Aplicar a regra de embalagem definida para o MVP.
4.  Solicitar cotação ao Melhor Envio, com timeout.
5.  Tratar indisponibilidade ou erro da API.
6.  Apresentar opções de serviço, preço e prazo.
7.  Registrar as opções apresentadas em `shipping_quotes`.
8.  Associar a opção selecionada ao contexto ou pedido.

Esboço:

``` ts
Deno.serve(async (req) => {
  const { cep, items } = await req.json();

  const products = await getProducts(items);        // dados do banco
  const packageData = calculatePackage(products, items); // regra do MVP

  const quotes = await fetchMelhorEnvioQuotes({
    cep,
    ...packageData,
    timeoutMs: 10_000,
  });

  return Response.json(quotes);
});
```

O token do Melhor Envio fica em Edge Function Secrets, nunca em tabelas
acessíveis ao painel.

### Módulo `handoff` (antigo WF-05 --- Atendimento humano)

1.  Receber a solicitação de atendimento.
2.  Marcar `human_handoff = true` e `handoff_at = now()`.
3.  Notificar a responsável.
4.  Não enviar respostas automáticas enquanto o atendimento estiver
    suspenso (verificação feita no webhook, etapa 9).

### Módulo `order-status` (antigo WF-06 --- Consulta de pedido)

1.  Identificar o cliente pelo telefone de origem.
2.  Consultar seus pedidos.
3.  Apresentar os pedidos recentes e respectivos status.
4.  Permitir selecionar um pedido para ver os detalhes básicos.

Não permitir que o cliente informe livremente um identificador e acesse
pedidos de terceiros.

### Módulo `notify` (notificação à responsável)

A notificação pode ser enviada como mensagem de WhatsApp para o número
pessoal da responsável. Fora da janela de 24 horas de atendimento, a
Meta exige template aprovado; portanto, criar um template simples de
"nova solicitação" / "cliente pediu atendimento". Como alternativa ou
complemento, a notificação pode ser enviada por e-mail.

**Decisão da Fase 4:** sem template. O aviso é feito no painel: os itens
Pedidos e Atendimento do menu mostram, em tempo real (Supabase Realtime
sobre `orders` e `conversations`, sujeito a RLS), quantos pedidos estão em
`received` e quantas conversas têm `human_handoff = true`. O texto por
WhatsApp continua como tentativa, sem bloquear o atendimento.

## 8. Máquina de estados da conversa

Estados mínimos:

| Estado               | Significado                |
| -------------------- | -------------------------- |
| `MAIN_MENU`          | Menu principal             |
| `CATEGORY_SELECTION` | Seleção de categoria       |
| `PRODUCT_SELECTION`  | Seleção de produto         |
| `PRODUCT_DETAILS`    | Exibição de detalhes       |
| `QUANTITY_INPUT`     | Entrada de quantidade      |
| `CART_REVIEW`        | Revisão do carrinho        |
| `POSTAL_CODE_INPUT`  | Entrada do CEP             |
| `SHIPPING_SELECTION` | Seleção de frete           |
| `ORDER_CONFIRMATION` | Confirmação da solicitação |

O estado atual fica em `conversations.current_state`. Informações
temporárias ficam em `conversations.context`.

O atendimento humano não é um estado: a única fonte de verdade é
`conversations.human_handoff`. Enquanto ele for `true`, o webhook não
executa a máquina de estados (EF-01, etapa 9).

Toda transição deve ser validada. Uma resposta inesperada não pode fazer
o sistema criar um pedido ou alterar dados incorretamente. Nesses casos,
o bot deve reapresentar as opções válidas.

A lógica de transição deve ficar em `_shared/state-machine.ts` como
**função pura** (recebe estado, contexto e mensagem; devolve novo
estado, novo contexto e ações a executar). Assim, ela pode ser testada
com `deno test` sem chamar a Meta nem o banco.

## 9. Integração com WhatsApp

Utilizar a API oficial WhatsApp Cloud API da Meta, chamada diretamente
por HTTP a partir das Edge Functions.

Itens de configuração:

-   Aplicativo no Meta for Developers.
-   Conta WhatsApp Business e número configurado.
-   Token de acesso apropriado para produção (token de usuário de
    sistema, não o token temporário de teste).
-   Permissões necessárias.
-   Webhook HTTPS apontando para a URL da função `whatsapp-webhook`.
-   Verificação inicial do webhook (`GET` com `hub.challenge`).
-   Verificação da assinatura `X-Hub-Signature-256` dos eventos com o
    App Secret, conforme a documentação vigente.
-   Templates aprovados quando necessários (notificação à responsável e
    mensagens fora da janela de atendimento).

Considerações:

-   Respeitar a janela de atendimento e as regras atuais de mensagens da
    plataforma.
-   Responder ao webhook rapidamente; a Meta reenvia eventos que não
    recebem `200`.
-   Utilizar listas e botões interativos quando suportados e adequados.
-   Tratar mensagens duplicadas.
-   Tratar eventos de status de entrega sem confundi-los com mensagens
    recebidas.
-   Não assumir que uma chamada de envio bem-sucedida significa que a
    mensagem foi lida.
-   Disponibilizar uma alternativa de texto quando uma interação não for
    suportada.

## 10. Integração com Melhor Envio

### 10.1. Configuração

-   Criar conta da loja no Melhor Envio.
-   Obter credenciais de integração.
-   Guardar as credenciais em Edge Function Secrets.
-   Definir CEP de origem da loja.
-   Definir a regra de embalagem utilizada no MVP.
-   Se o token do Melhor Envio expirar e exigir renovação (OAuth),
    documentar o procedimento de renovação manual ou automatizá-lo com
    uma função agendada.

### 10.2. Dados enviados

A cotação precisa conter, conforme o contrato atual da API:

-   CEP de origem.
-   CEP de destino.
-   Peso.
-   Dimensões da embalagem.
-   Valor declarado/seguro, se aplicável.
-   Quantidade de volumes, se aplicável.

Os nomes exatos dos campos e o formato da requisição devem seguir a
documentação atual do Melhor Envio.

### 10.3. Tratamento de erros

Se a API estiver indisponível, demorar além do timeout ou não retornar
opções:

-   Não impedir o cliente de enviar uma solicitação de pedido.
-   Registrar que o frete não foi cotado.
-   Informar que a responsável confirmará o valor.
-   Não inventar preço ou prazo.

## 11. Segurança, privacidade e confiabilidade

### 11.1. Segurança

-   Habilitar RLS em todas as tabelas acessíveis pela API.
-   Criar políticas explícitas para o usuário administrativo.
-   Não utilizar a chave de serviço no frontend.
-   Guardar tokens e segredos em Edge Function Secrets.
-   Verificar a assinatura de todos os webhooks recebidos; funções
    publicadas sem JWT devem rejeitar qualquer requisição não assinada.
-   Restringir `EXECUTE` das RPCs internas ao papel de serviço.
-   Restringir acesso ao painel a usuários autenticados.
-   Não expor dados de clientes em consultas públicas.
-   Não armazenar dados pessoais desnecessários.

### 11.2. Idempotência

A Meta pode reenviar eventos. O sistema deve evitar processar a mesma
mensagem mais de uma vez.

O identificador externo da mensagem é registrado em
`whatsapp_inbound_messages` com restrição única. Não depender de memória
da execução: Edge Functions não mantêm estado entre chamadas.

A criação do pedido também deve ser protegida contra duplo envio de
confirmação, por meio do `idempotency_key` em `orders`.

### 11.3. Observabilidade

Para o MVP, basta:

-   Logs das Edge Functions no painel do Supabase.
-   Status de cada evento em `whatsapp_inbound_messages` (`processed`,
    `ignored`, `failed`) com mensagem de erro útil.
-   Identificador de conversa e pedido nos logs.
-   Reprocessamento manual após correção: reexecutar o `payload` de
    mensagens `failed` ou presas em `received` (por exemplo, por um script ou uma função
    administrativa protegida que lê a mensagem e a reprocessa).

Evitar registrar tokens, conteúdo sensível ou dados pessoais
desnecessários nos logs.

### 11.4. Backup e disponibilidade

-   Avaliar a política de backup disponível no plano Supabase utilizado.
-   Manter migrations SQL versionadas no Git.
-   Manter o código das Edge Functions versionado no Git.
-   Documentar como recriar os segredos e configurar o webhook na Meta.
-   Considerar que projetos gratuitos do Supabase possuem limitações de
    disponibilidade e podem ser pausados por inatividade. Com toda a
    automação no Supabase, uma pausa do projeto interrompe também o
    atendimento pelo WhatsApp; avaliar o plano pago antes de ir para
    produção.

## 12. Estrutura do repositório

``` text
scrapbook-store/
├── apps/
│   └── admin/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── services/
│       │   ├── types/
│       │   └── routes/
│       ├── public/
│       └── package.json
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── whatsapp-webhook/
│   │   │   └── index.ts
│   │   ├── calculate-shipping/
│   │   │   └── index.ts
│   │   ├── _shared/
│   │   │   ├── supabase.ts
│   │   │   ├── whatsapp.ts
│   │   │   ├── state-machine.ts
│   │   │   ├── catalog.ts
│   │   │   ├── cart.ts
│   │   │   ├── orders.ts
│   │   │   ├── shipping.ts
│   │   │   ├── handoff.ts
│   │   │   ├── order-status.ts
│   │   │   └── notify.ts
│   │   └── tests/
│   ├── seed.sql
│   └── config.toml
│
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── edge-functions.md
│   ├── setup.md
│   └── operations.md
│
├── .env.example
└── README.md
```

Não versionar arquivos `.env`, tokens ou credenciais. O diretório
`automation/` e o `docker-compose.yml` da versão 1.0 deixam de existir.

## 13. Fases de implementação

A ordem prioriza construir primeiro a parte que pode ser testada sem
depender da Meta ou do Melhor Envio.

### Fase 0 --- Preparação do projeto

**Objetivo:** preparar o repositório e as ferramentas.

Tarefas:

-   Criar repositório Git.
-   Criar estrutura de diretórios.
-   Definir convenções de código.
-   Criar arquivo `.env.example`.
-   Criar projeto Supabase.
-   Instalar a Supabase CLI e iniciar o projeto local
    (`supabase init`, `supabase start`).
-   Criar projeto React + TypeScript.

**Critério de aceite:** aplicação React executa localmente e conecta ao
projeto Supabase; uma Edge Function de exemplo roda localmente com
`supabase functions serve`.

### Fase 1 --- Banco de dados e segurança

**Objetivo:** estabelecer a fonte de verdade.

Tarefas:

-   Criar migrations das tabelas necessárias, incluindo
    `whatsapp_inbound_messages`.
-   Criar chaves estrangeiras, índices e restrições.
-   Criar a RPC transacional de criação de pedido, com idempotência.
-   Criar trigger ou função para histórico de status.
-   Configurar Supabase Auth (cadastro público desligado).
-   Criar tabela `admins` e função `is_admin()`.
-   Configurar RLS e restringir `EXECUTE` das RPCs internas.
-   Criar bucket público de imagens, com escrita restrita a `is_admin()`.
-   Inserir dados fictícios para desenvolvimento.

**Critério de aceite:** tabelas e relacionamentos funcionam; acesso
administrativo está protegido; criação de pedido mantém consistência
entre pedido e itens e não duplica pedidos com a mesma chave.

### Fase 2 --- Painel administrativo

**Objetivo:** permitir que a responsável gerencie o catálogo e os
pedidos.

Tarefas:

-   Implementar login.
-   Implementar listagem de produtos.
-   Implementar cadastro e edição.
-   Implementar upload de fotos.
-   Implementar ativação/desativação.
-   Validar preço, peso e dimensões.
-   Implementar listagem de pedidos.
-   Implementar visualização de detalhes.
-   Implementar atualização de status.

**Critério de aceite:** a responsável consegue, pelo celular ou
computador, cadastrar um produto com preço, foto, peso e dimensões;
visualizar solicitações e atualizar seus status.

### Fase 3 --- Edge Functions e WhatsApp

**Objetivo:** estabelecer comunicação entre WhatsApp e sistema.

Tarefas:

-   Implementar a máquina de estados como função pura, com testes.
-   Configurar segredos locais e em produção
    (`supabase secrets set`).
-   Criar conta/aplicação na Meta.
-   Configurar Cloud API.
-   Expor a função local por um túnel HTTPS (por exemplo, ngrok ou
    Cloudflare Tunnel) durante o desenvolvimento, ou publicar em um
    projeto Supabase de desenvolvimento.
-   Implementar verificação do webhook e da assinatura.
-   Implementar recebimento de mensagens.
-   Implementar deduplicação em `whatsapp_inbound_messages`.
-   Implementar identificação de cliente.
-   Implementar persistência de conversa com controle de concorrência.
-   Criar menu principal.
-   Implementar transferência para atendimento humano.
-   Reativar o bot pelo painel (`conversations.human_handoff`, seção
    4.4).

**Critério de aceite:** mensagem recebida no WhatsApp chega à Edge
Function, é associada ao cliente e recebe uma resposta correta; a
solicitação de atendimento humano suspende o bot; mensagens reenviadas
pela Meta não são processadas duas vezes.

### Fase 4 --- Catálogo e pedidos pelo WhatsApp

**Objetivo:** permitir que o cliente selecione produtos e envie uma
solicitação.

Tarefas:

-   Consultar categorias ativas.
-   Apresentar produtos ativos.
-   Apresentar fotos, descrições e preços.
-   Implementar seleção de produto.
-   Implementar quantidade.
-   Implementar carrinho temporário.
-   Implementar revisão e remoção de itens.
-   Implementar resumo.
-   Criar pedido pela RPC transacional.
-   Criar template e notificar responsável.
-   Implementar consulta de pedidos pelo telefone do cliente.

**Critério de aceite:** um cliente consegue navegar pelo catálogo,
selecionar produtos e quantidades e enviar uma solicitação que aparece
corretamente no painel administrativo.

### Fase 5 --- Cotação de frete

**Objetivo:** apresentar estimativa de transporte no fluxo de compra.

Tarefas:

-   Configurar credenciais do Melhor Envio em Edge Function Secrets.
-   Configurar CEP de origem.
-   Definir regra de embalagem.
-   Implementar validação do CEP.
-   Implementar o módulo `shipping` (e, se útil, a função
    `calculate-shipping`).
-   Implementar requisição de cotação com timeout.
-   Tratar erros e ausência de serviços.
-   Apresentar opções ao cliente.
-   Registrar cotação selecionada no pedido.

**Critério de aceite:** o cliente informa o CEP e recebe opções de frete
quando disponíveis; falhas ou lentidão na integração não impedem o envio
da solicitação.

### Fase 6 --- Testes integrados e publicação

**Objetivo:** validar o fluxo completo e disponibilizar o sistema.

Tarefas:

-   Testar cadastro, edição e desativação de produtos.
-   Testar catálogo com produtos ativos e inativos.
-   Testar carrinho com um e vários produtos.
-   Testar quantidades inválidas.
-   Testar envio duplicado de mensagens.
-   Testar mensagens simultâneas do mesmo cliente.
-   Testar falha do Supabase.
-   Testar falha e timeout do Melhor Envio.
-   Testar transferência para atendimento humano.
-   Testar consulta de pedidos.
-   Testar reprocessamento de mensagem `failed`.
-   Publicar painel.
-   Publicar as Edge Functions no projeto de produção
    (`supabase functions deploy`).
-   Configurar o webhook de produção na Meta.
-   Documentar operação e recuperação.

**Critério de aceite:** o fluxo completo funciona em ambiente de
produção, desde a primeira mensagem até a visualização e atualização do
pedido no painel, sem nenhum servidor mantido pela equipe.

## 14. Estratégia de testes

### Testes do banco

-   Produto não pode ter preço negativo.
-   Peso e dimensões devem ser positivos.
-   Produto deve pertencer a uma categoria válida.
-   Quantidade de item deve ser positiva.
-   Pedido deve ser criado com todos os itens ou não ser criado.
-   Mesma chave de idempotência não cria dois pedidos.
-   Alteração do preço do produto não pode alterar pedidos antigos.
-   Usuário não autenticado não pode administrar produtos ou pedidos.
-   Usuário autenticado do painel não pode chamar RPCs internas nem ler
    `whatsapp_inbound_messages`.

### Testes do painel

-   Login e logout.
-   Cadastro de produto válido.
-   Bloqueio de dados logísticos inválidos.
-   Upload de imagem.
-   Edição de produto.
-   Desativação de produto.
-   Listagem de pedidos.
-   Alteração de status.

### Testes unitários das Edge Functions (`deno test`)

-   Transições válidas e inválidas da máquina de estados.
-   Atualização do carrinho (adicionar, alterar, remover).
-   Validação de CEP e de quantidade.
-   Regra de embalagem.
-   Verificação de assinatura da Meta (válida e inválida).
-   Interpretação dos formatos de evento da Meta (texto, lista, botão,
    status).

### Testes de automação (integrados)

-   Primeiro contato.
-   Retorno de cliente conhecido.
-   Navegação por categoria.
-   Seleção de produto.
-   Quantidade inválida.
-   Carrinho com vários itens.
-   Confirmação de solicitação.
-   Mensagem duplicada.
-   Requisição sem assinatura ou com assinatura inválida.
-   Atendimento humano.
-   Consulta de pedido.

### Testes de frete

-   CEP válido.
-   CEP inválido.
-   Nenhuma transportadora disponível.
-   API indisponível.
-   API lenta (timeout).
-   Produto sem dados logísticos (deve ser impedido no cadastro).
-   Pedido com mais de um produto.

## 15. Variáveis de ambiente e segredos

Exemplo de variáveis do painel:

``` env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

A chave pública pode ser usada no navegador desde que as políticas RLS
estejam corretamente configuradas.

Segredos das Edge Functions, configurados com `supabase secrets set` (ou
pelo painel do Supabase) e nunca expostos ao frontend:

``` env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
OWNER_WHATSAPP_NUMBER=
MELHORENVIO_ACCESS_TOKEN=
STORE_POSTAL_CODE=
```

A URL do projeto e a credencial de serviço do Supabase já ficam
disponíveis como variáveis de ambiente dentro das Edge Functions e não
precisam ser cadastradas manualmente. Para desenvolvimento local, os
segredos ficam em `supabase/functions/.env` (não versionado).

Os nomes são ilustrativos. A credencial de serviço concede privilégios
elevados e deve ser usada somente dentro das funções.

## 16. Definição de pronto do MVP

O MVP será considerado concluído quando:

1.  A responsável conseguir entrar no painel.
2.  A responsável conseguir cadastrar um produto com nome, descrição,
    categoria, preço, foto, peso e dimensões.
3.  Produtos inativos não aparecerem no catálogo do WhatsApp.
4.  O cliente conseguir navegar pelo catálogo.
5.  O cliente conseguir selecionar produtos e quantidades.
6.  O cliente conseguir revisar e enviar uma solicitação de pedido.
7.  A solicitação aparecer no painel com cliente, itens e valores.
8.  A responsável conseguir atualizar o status do pedido.
9.  O cliente conseguir solicitar atendimento humano.
10. O bot respeitar a suspensão do atendimento automático.
11. O cliente conseguir consultar seus próprios pedidos.
12. O cliente conseguir receber uma cotação de frete quando a integração
    estiver disponível.
13. Falhas de frete não impedirem a criação da solicitação.
14. Dados administrativos e credenciais estiverem protegidos.
15. Toda a operação rodar no Supabase, sem VPS ou servidor mantido pela
    equipe.

## 17. Decisões técnicas consolidadas

| Tema                       | Decisão                                                     |
| -------------------------- | ----------------------------------------------------------- |
| Banco                      | PostgreSQL via Supabase                                     |
| Banco documental           | Não utilizar MongoDB                                        |
| Backend próprio            | Fora do MVP; lógica de servidor em Edge Functions           |
| Acesso do painel ao banco  | Supabase SDK + RLS                                          |
| Automação                  | Supabase Edge Functions (TypeScript/Deno)                   |
| n8n / VPS                  | Não utilizar                                                |
| Linguagem da automação     | TypeScript (mesma do painel); sem Python no MVP             |
| WhatsApp                   | Cloud API oficial da Meta, chamada direto das Edge Functions|
| Deduplicação               | Tabela `whatsapp_inbound_messages` com restrição única      |
| Conversa                   | Uma linha por cliente, reset por inatividade                |
| Autorização do painel      | Tabela `admins` + função `is_admin()` nas políticas RLS     |
| Bucket de imagens          | Público para leitura, escrita só `is_admin()`               |
| Atendimento humano (estado)| Só `human_handoff`; sem estado `HUMAN_HANDOFF`              |
| Catálogo                   | Dados do Supabase apresentados pelo bot                     |
| Personalização de produtos | Não haverá                                                  |
| Dados de envio             | Peso e dimensões obrigatórios no cadastro                   |
| Frete                      | Melhor Envio, via módulo `shipping` nas Edge Functions      |
| Painel                     | React + TypeScript                                          |
| Imagens                    | Supabase Storage                                            |
| Pagamentos                 | Fora do MVP (webhooks futuros também via Edge Functions)    |
| IA generativa              | Fora do MVP                                                 |
| Estoque                    | Fora do MVP                                                 |
| Atendimento humano         | Pelo WhatsApp Business, com suspensão do bot                |

## 18. Referências oficiais

-   [Supabase Documentation](https://supabase.com/docs)
-   [Supabase Pricing](https://supabase.com/pricing)
-   [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
-   [Supabase Storage](https://supabase.com/docs/guides/storage)
-   [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
-   [Supabase Edge Functions --- Limites](https://supabase.com/docs/guides/functions/limits)
-   [Supabase Edge Functions --- Segredos](https://supabase.com/docs/guides/functions/secrets)
-   [Supabase Edge Functions --- Tarefas em segundo plano](https://supabase.com/docs/guides/functions/background-tasks)
-   [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
-   [Melhor Envio API](https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio)

------------------------------------------------------------------------

**Diretriz final de implementação:** manter o MVP pequeno. Se uma
funcionalidade não for necessária para cadastrar produtos, apresentar o
catálogo, receber solicitações, calcular uma estimativa de frete ou
permitir o acompanhamento básico dos pedidos, ela não deve entrar nesta
versão.
