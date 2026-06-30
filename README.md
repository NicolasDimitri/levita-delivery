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
6. **Módulos:** marque **Order**, **Events** e **Merchant**. Não marque Catalog, Review nem Shipping (não são usados neste app)

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
Anote os 3 `merchantId` retornados → variável `IFOOD_MERCHANT_IDS` (separados por vírgula, sem espaço).

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

## 5. Como testar o fluxo de ponta a ponta

1. No Portal do iFood, use a **loja de teste** pra gerar um pedido de teste (tem essa opção dentro do ambiente de homologação)
2. O evento `PLACED` deve chegar no seu webhook e o pedido deve aparecer na tela `/admin`
3. Clique em **Aceitar pedido**
4. Selecione um entregador (cadastre um entregador de teste em `/cadastro` antes) e clique em **Despachar**
5. Faça login como esse entregador em outra aba → o pedido deve aparecer em `/entregas`
6. Clique em **Confirmar entrega** e digite um código de teste (no ambiente de homologação o iFood costuma fornecer um código de teste fixo — confira a documentação de "Gerar pedidos teste")

---

## 6. Pontos de atenção / coisas pra revisar antes de produção

- **Nomes de campos de adicionais**: no arquivo `api/ifood/webhook.js`, a leitura dos adicionais (`item.options`) foi feita com base na documentação pública, mas o iFood às vezes varia esse campo por categoria de pedido. Gere um pedido de teste real e confira o JSON antes de confiar 100% nisso — ajuste se precisar.
- **Prazo de confirmação**: o iFood cancela automaticamente pedidos não confirmados em poucos minutos. Fique de olho na tela de admin com alguma notificação sonora/visual se for usar isso de verdade no dia a dia (não incluído neste MVP).
- **Esse projeto não inclui polling como rede de segurança** — se o webhook falhar ou cair por algum motivo, o pedido só vai aparecer quando o próximo evento (ex: CONCLUDED) chegar. Pra produção séria, vale adicionar um polling de segurança depois.
