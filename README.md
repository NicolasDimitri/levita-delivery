# Sistema de Entregas — Setup completo

Guia passo a passo pra colocar o app no ar: Supabase, iFood e Vercel.

---

## 1. Supabase

### 1.1 Criar o projeto
1. Acesse [supabase.com](https://supabase.com) → **New project**
2. Anote a senha do banco (Database password) — você não vai precisar dela pro app, mas guarde por segurança
3. Espere o projeto provisionar (1-2 min)

### 1.2 Rodar o schema
1. No painel do projeto, vá em **SQL Editor** → **New query**
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie todo o conteúdo e cole no editor
3. Clique em **Run** — isso cria todas as tabelas, políticas de RLS e habilita o Realtime

### 1.3 Pegar as chaves de API
Vá em **Project Settings → API**. Você vai precisar de 3 valores:

| Onde aparece no Supabase | Nome na env var | Vai pra onde |
|---|---|---|
| Project URL | `VITE_SUPABASE_URL` | frontend + funções serverless |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` | frontend (é segura, protegida pelo RLS) |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` | **só** funções serverless (`/api`) — nunca no frontend |

⚠️ A `service_role` key ignora todas as regras de RLS. Nunca coloque ela em uma variável que comece com `VITE_` (isso a exporia no navegador).

### 1.4 Criar o usuário administrador
Você é o único admin, e ele não pode ser criado pela tela do app — só manualmente:

1. No Supabase, vá em **Authentication → Users → Add user → Create new user**
2. Preencha e-mail e senha, confirme
3. Copie o **UUID** do usuário criado (aparece na lista de usuários)
4. Vá no **SQL Editor** e rode (troque o UUID e o nome):

```sql
insert into public.profiles (id, role, name)
values ('COLE_O_UUID_AQUI', 'admin', 'Seu Nome');
```

Pronto — esse e-mail/senha já loga como admin no app.

### 1.5 Entregadores
Não precisa fazer nada aqui — eles se cadastram pela tela `/cadastro` do próprio app, que já cria o perfil deles como `driver` automaticamente.

---

## 2. iFood Developer Portal

### 2.1 Criar o aplicativo
1. Acesse [developer.ifood.com.br](https://developer.ifood.com.br) e faça login
2. Vá em **Meus Apps → Novo Aplicativo**
3. **Categoria do aplicativo:** escolha **PDV**
4. **Tipo de aplicativo:** escolha **Centralizado**
5. Preencha nome, slug e descrição (qualquer texto, é só pra você reconhecer o app)
6. **Módulos:** para a operação do app, marque **Order**, **Events** e **Merchant**. O módulo **Catalog** também é necessário para executar a homologação descrita na seção 2.6. Review e Shipping não são usados.

### 2.2 Pegar as credenciais
1. Dentro do app criado, vá na aba **Credenciais**
2. Copie o **Client Id** → variável `IFOOD_CLIENT_ID`
3. Copie o **Client Secret** → variável `IFOOD_CLIENT_SECRET` (esse mesmo valor também é usado pra validar a assinatura do webhook)

### 2.3 Configurar o Webhook
Isso só fica disponível depois de fazer o primeiro deploy (você precisa de uma URL pública). Depois de deployar na Vercel (passo 3):

1. No app do iFood, vá na aba do recurso de **Webhook**
2. Cole a URL: `https://SEU-PROJETO.vercel.app/api/ifood/webhook`
3. Salve

### 2.4 Pegar um token de acesso (app Centralizado usa client_credentials)

⚠️ Correção importante: o fluxo de `userCode` (autorização manual por loja) é exclusivo de apps **Distribuído**. Como nosso app é **Centralizado**, ele não suporta esse grant type — só `client_credentials`. Não tente usar `/oauth/userCode` com esse client_id, vai dar erro "Grant type not authorized for client".

1. Gere um token:
```bash
curl --compressed -X POST "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grantType=client_credentials&clientId=SEU_CLIENT_ID&clientSecret=SEU_CLIENT_SECRET"
```

2. Liste as lojas que já estão liberadas pra esse client_id:
```bash
curl --compressed -X GET "https://merchant-api.ifood.com.br/merchant/v1.0/merchants" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

No app de teste, a loja de teste já deve aparecer aqui automaticamente, sem nenhum passo manual de autorização.

Pra vincular as 3 lojas reais ao app de produção (depois da homologação), o caminho provavelmente é direto pelo Portal do Parceiro de cada loja — esse passo específico ainda precisa ser confirmado na hora, quando chegarmos lá.

### 2.5 Descobrir o merchantId das suas lojas
Depois de autorizado, gere um token e liste as lojas:
```bash
# 1. gerar token
curl -X POST "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grantType=client_credentials&clientId=SEU_CLIENT_ID&clientSecret=SEU_CLIENT_SECRET"

# 2. listar merchants (use o accessToken retornado acima)
curl -X GET "https://merchant-api.ifood.com.br/merchant/v1.0/merchants" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```
Em produção, anote os 3 `merchantId` retornados para `IFOOD_MERCHANT_IDS`. No ambiente de desenvolvimento, use somente o ID da loja de teste.

### 2.6 Preparar o aplicativo de teste para homologação

No ambiente de desenvolvimento, use as credenciais do aplicativo de teste em `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET` e deixe exatamente um `merchantId` de teste em `IFOOD_MERCHANT_IDS`. A identificação do ambiente usa essa lista: com exatamente um ID a homologação fica habilitada; com mais de um ID (configuração de produção) as operações ficam bloqueadas. Não misture IDs de lojas de produção na configuração de desenvolvimento.

Os IDs disponíveis podem ser conferidos na tela **Homologação iFood** do painel administrativo. As operações de pausa, horário, categoria, item, preço e disponibilidade alteram os dados da loja selecionada. As credenciais permanecem no servidor e não são expostas ao navegador.

No painel administrativo, abra **Homologação iFood** para executar os cenários Merchant e Catalog e conferir as respostas da API. Grave cada cenário separadamente, mostrando também o Portal do Parceiro. Envie ao suporte os links dos vídeos, a data/hora e o `client_id` do app de teste, além dos logs de HTTP Requests baixados em **Developer Portal → Logs da API**.

---

## 3. Deploy na Vercel

1. Suba este projeto num repositório no GitHub
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório
3. Em **Environment Variables**, adicione todas as variáveis do `.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `IFOOD_CLIENT_ID`
   - `IFOOD_CLIENT_SECRET`
   - `IFOOD_MERCHANT_IDS`
   - `ORS_API_KEY` (chave privada do openrouteservice, somente no servidor)
4. Clique em **Deploy**
5. Depois do primeiro deploy, volte no passo **2.3** e configure a URL do webhook com o domínio que a Vercel te deu

---

## 4. Testando localmente antes do deploy

```bash
npm install
cp .env.example .env.local   # preencha com seus valores reais
npm run dev
```

O frontend abre em `http://localhost:5173`. As funções `/api` **não rodam** com `npm run dev` puro (isso é só o Vite). Pra testar as funções localmente, instale a CLI da Vercel e use:

```bash
npm install -g vercel
vercel dev
```

Isso roda frontend + funções serverless juntos localmente.

---

**Despacho sem confirmação:** se o Gestor de Pedidos do iFood mostrar o pedido como despachado/em rota, mas o painel continuar em “Pronto”, use **Sincronizar após confirmar no iFood** no cartão do pedido. Essa ação não chama o iFood nem reenvia o despacho; apenas corrige o status local após a confirmação manual.

**Rotas do entregador:** antes de publicar, execute `supabase/migration_order_route_coordinates.sql` no banco de cada ambiente e atualize também a Edge Function `ifood-webhook`. Google Maps e Waze usam as coordenadas do iFood; a rota inclui apenas pedidos despachados, e o Google Maps mantém o retorno ao endereço da loja. O botão de cópia usa rua, número e bairro, não as coordenadas. O antigo endereço personalizado (`route_address`) deixa de ser usado para navegação e cópia.

No cartão do pedido, o administrador pode alterar a localização informando latitude e longitude decimais separadas por vírgula ou restaurar as coordenadas originais do iFood. A correção vale para a rota e o cálculo do repasse, e só pode ser feita antes da conclusão; repasses já registrados não são recalculados. O entregador deve abrir a rota novamente após uma alteração. Se faltarem coordenadas válidas, a rota é bloqueada e o administrador é avisado; a cópia do endereço continua disponível quando houver dados.

**Saldo do entregador:** antes de publicar, execute `supabase/migration_driver_route_earnings.sql` e configure `ORS_API_KEY` tanto nas variáveis da Vercel quanto nos segredos da Edge Function no Supabase, para cada ambiente utilizado. A confirmação e a nova tentativa usam a chave na Vercel; o webhook usa a chave no Supabase. Publique também a Edge Function `ifood-webhook` com o código atualizado. A migração preserva os valores históricos e exige que não existam registros duplicados de `delivery_history.order_id`; se houver, confira-os e resolva-os antes de executá-la. Não execute novamente a antiga `migration_fix_driver_delivery_earnings.sql`, pois ela sobrescreve os valores históricos.

Novas entregas usam a rota mais curta de carro do openrouteservice, da loja (latitude -7.224483, longitude -35.868339) até as coordenadas do pedido: até 2,5 km, R$ 5; acima de 2,5 até 3,5 km, R$ 6; acima de 3,5 até 4,5 km, R$ 7; acima de 4,5 km, R$ 8. Usa-se a distância exata retornada, sem truncamento. O perfil é de carro, não moto. Entregas sem coordenadas ou cuja consulta falhe ficam sem crédito, sinalizadas como pendentes na carteira e na aba Entregadores; o administrador pode tentar novamente nessa aba. Para um pedido já concluído sem coordenadas válidas, é necessário corrigir os dados no banco antes de tentar novamente. O saldo mostrado não inclui repasses pendentes.

**Ajustes de saldo:** execute `supabase/migration_driver_balance_adjustments.sql` no SQL Editor antes de publicar esta versão. Na aba Entregadores, o administrador pode somar ou subtrair valores informando o motivo; os ajustes aparecem também na carteira do entregador. Descontos podem deixar o saldo negativo, compensado por ganhos futuros. O saldo é a soma das entregas e dos ajustes, menos os pagamentos registrados. O endpoint legado de solicitação de saque não aceita saldos com ajustes ou repasses pendentes; o pagamento continua sendo registrado manualmente pelo administrador. Ajustes não alteram os valores das entregas nem são lançados automaticamente.

**Preview — aceite e despacho pelo entregador:** antes de testar esta alteração, execute `supabase/migration_driver_self_assignment.sql` no SQL Editor do projeto Supabase de desenvolvimento/preview. Ela libera a listagem segura de pedidos disponíveis, o aceite atômico com limite de 3 entregas ativas, a reatribuição administrativa e a trava de despacho. Não execute essa migração no projeto de produção enquanto a alteração não for aprovada.

**Estimativa de repasses:** antes de publicar a funcionalidade, execute `supabase/migration_order_subtotal.sql`, `supabase/migration_weekly_order_estimates.sql` e `supabase/migration_weekly_estimates_service_fee.sql`, nessa ordem, no banco Supabase. A primeira guarda o objeto completo do pedido do iFood em `orders.subtotal`; as demais criam e atualizam a consulta restrita a administradores usada pela aba Repasses. A estimativa usa pedidos concluídos e data original do pedido em horário de Brasília. A base das taxas é o valor dos itens mais entrega própria menos incentivo da loja; são deduzidos 12% de comissão e, no pagamento online, 3,2% de transação, arredondados separadamente. Taxas adicionais e incentivos do iFood não alteram essa base. O valor previsto para pagamento na entrega é abatido do repasse estimado. Pedidos sem dados suficientes, data original, com valores inconsistentes, pagamento parcial ou incentivos não identificados são excluídos e sinalizados. Ajustes do demonstrativo, como o reembolso da taxa de serviço, não estão incluídos; confira o repasse oficial.

Para a aba Saldo, execute também `supabase/migration_order_settlement_history.sql` no banco Supabase. O saldo é a soma dos repasses estimados no histórico de pedidos concluídos, inclusive a semana em andamento; não representa o saldo bancário nem os repasses oficiais. Semanas e lojas com pedidos não calculáveis apresentam valores parciais.

Se `migration_order_service_fee.sql` já tiver sido executada no banco, execute também `supabase/migration_remove_order_service_fee.sql` para remover a coluna não utilizada `service_fee`.

**Estoque:** acesse **Estoque** no painel de pedidos para cadastrar locais e itens, consultar saldos e registrar aumentos ou diminuições com justificativa. Escolha um único local compartilhado para itens usados pelas três lojas. O saldo mostrado pertence ao local selecionado; o cadastro do item não cria estoque automaticamente.

Antes de usar a tela em cada ambiente, execute `supabase/migration_inventory.sql` uma vez no banco Supabase com o schema existente. A migração foi executada em desenvolvimento, mas **ainda precisa ser executada em produção** antes da publicação. Para um banco novo, rode também essa migração após o schema principal.

Cadastre locais em `inventory_locations` (por exemplo, cozinha central e cada loja), itens em `inventory_items` e fichas técnicas em `inventory_recipes` e `inventory_recipe_ingredients`. Cada item tem uma unidade fixa: gramas (`g`), mililitros (`ml`) ou unidades (`un`), com até três casas decimais. Cadastre cru e preparado como itens distintos: 1 kg de carne crua são 1.000 g e 700 g de carne cozida são outro item. A ficha técnica guarda as quantidades e o rendimento **esperados**, não uma conversão automática.

Administradores autenticados registram movimentos pelas funções RPC, cada uma com um UUID de operação novo:

- `inventory_record_movement`: entrada (`entry`), perda (`loss`) ou ajuste (`adjustment`). Entrada e perda usam quantidade positiva; ajuste aceita valor positivo ou negativo. Perdas e ajustes exigem justificativa em `p_note`.
- `inventory_transfer`: transfere o mesmo item entre dois locais.
- `inventory_produce`: informa a receita, local, quantidade **real** produzida e ingredientes **realmente** utilizados em `p_inputs`, uma lista como `[{"item_id":"UUID-DO-ITEM","quantity":1000}]`. Insumos e produto final devem estar no mesmo local; transfira-os antes ou depois quando necessário. Os ingredientes reais podem diferir da ficha técnica.

Os saldos e movimentos são atualizados juntos; saldo insuficiente cancela a operação inteira. Após uma falha de comunicação, a tela mantém a operação pendente neste navegador e permite reenviá-la com o mesmo UUID, evitando duplicação. Não apague os dados do navegador nem registre a mesma movimentação em outro dispositivo antes de confirmar seu resultado. Não altere saldos diretamente. Os registros reais ficam no histórico de movimentos; a ficha técnica pode ser editada e não é um retrato histórico do rendimento esperado. A execução das RPCs exige sessão de administrador (`auth.uid()`), inclusive durante testes; o SQL Editor sem sessão de usuário não substitui essa autenticação.

Ainda não há telas de receitas, preparo ou transferência, baixa automática por pedidos, vínculo com códigos do iFood, controle de lotes/validade, custos ou pausa automática de produtos. Antes de usá-los, é necessário implementar essas etapas. O arquivo `supabase/tests/inventory.sql` contém testes transacionais para um banco de teste descartável com o schema e a migração aplicados; ele não deve ser executado em produção.

Para manter um histórico de eventos além da retenção dos logs da Vercel, execute `supabase/migration_ifood_webhook_attempts.sql` no SQL Editor de cada projeto Supabase antes de publicar a alteração. Os registros ficam disponíveis por 30 dias na tabela `public.ifood_webhook_attempts`:

```sql
select received_at, event_id, code, order_id, outcome, error_message
from public.ifood_webhook_attempts
where code = 'DSP' or order_id = 'ID_DO_PEDIDO_NO_IFOOD'
order by received_at desc
limit 100;
```

**Clientes problemáticos:** antes de publicar a funcionalidade, execute `supabase/migration_customer_problem_flag.sql` no SQL Editor do Supabase. No painel administrativo, é possível marcar um cliente pelo cartão de qualquer pedido; o alerta e o motivo opcional aparecem nos pedidos seguintes desse cliente. A marcação é apenas informativa e pode ser removida no próprio cartão.

### Webhook no Supabase

A Edge Function `ifood-webhook` reutiliza o processamento e a validação de assinatura do webhook da Vercel. A publicação da função não altera automaticamente a URL cadastrada no iFood.

1. Confirme o **Project Reference ID** do ambiente escolhido e que o banco possui as tabelas e migrações necessárias, incluindo `webhook_events` e `ifood_webhook_attempts`. Aplique `supabase/migration_ifood_webhook_attempts.sql` somente se necessário.
2. Em **Edge Functions → Secrets** do projeto escolhido, configure `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET` com as credenciais da aplicação iFood correspondente ao ambiente. Não coloque esses valores no repositório. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo Supabase à função.
3. Após autenticar a CLI do Supabase, publique no projeto escolhido:

   ```sh
   npx supabase@3.2.0 functions deploy ifood-webhook --use-api --remote=ID_DO_PROJETO --no-verify-jwt
   ```

4. Antes de alterar o endereço no iFood, confira a implantação e teste uma requisição sem assinatura: ela deve receber `401`. A função não usa JWT do Supabase porque o iFood não o envia; a assinatura HMAC do iFood continua obrigatória.
5. Configure na aplicação iFood correspondente a URL `https://ID_DO_PROJETO.supabase.co/functions/v1/ifood-webhook`. Antes de migrar produção, valide um pedido completo em desenvolvimento. Na troca de produção, mantenha a URL anterior da Vercel para reversão e acompanhe o recebimento dos eventos e pedidos.

Monitore os logs e o uso de Edge Functions no Supabase e os de CPU na Vercel. Pausar o projeto Supabase de desenvolvimento também interrompe o webhook.

Para limpar os registros do banco de desenvolvimento, execute `supabase/migration_dev_webhook_cleanup.sql` **somente no projeto de desenvolvimento**. Ela agenda no Supabase, diariamente às 06:00 UTC, a exclusão de eventos com mais de 48 horas e tentativas com mais de 30 dias. A limpeza de produção continua agendada na Vercel.

---

## 5. Como testar o fluxo de ponta a ponta

1. No Portal do iFood, use a **loja de teste** pra gerar um pedido de teste (tem essa opção dentro do ambiente de homologação)
2. O evento `PLACED` deve chegar no seu webhook e o pedido deve aparecer na tela `/admin`
3. Clique em **Aceitar pedido**
4. Durante o preparo, clique em **Marcar como pronto**; isso informa `readyToPickup` ao iFood antes de atualizar o status local
5. Selecione um entregador (cadastre um entregador de teste em `/cadastro` antes) e clique em **Despachar**; para entregas próprias, a API informa `deliveredBy: MERCHANT`
6. Faça login como esse entregador em outra aba → o pedido deve aparecer em `/entregas`
7. Clique em **Confirmar entrega** e informe o código de confirmação fornecido para aquele pedido pelo iFood

---

## 6. Pontos de atenção / coisas pra revisar antes de produção

- **Nomes de campos de adicionais**: no arquivo `api/ifood/webhook.js`, a leitura dos adicionais (`item.options`) foi feita com base na documentação pública, mas o iFood às vezes varia esse campo por categoria de pedido. Gere um pedido de teste real e confira o JSON antes de confiar 100% nisso — ajuste se precisar.
- **Prazo de confirmação**: o iFood cancela automaticamente pedidos não confirmados em poucos minutos. Fique de olho na tela de admin com alguma notificação sonora/visual se for usar isso de verdade no dia a dia (não incluído neste MVP).
- **Esse projeto não inclui polling como rede de segurança** — se o webhook falhar ou cair por algum motivo, o pedido só vai aparecer quando o próximo evento (ex: CONCLUDED) chegar. Pra produção séria, vale adicionar um polling de segurança depois.
