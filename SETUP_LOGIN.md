# Ativar login no AXO Studio AI

O site usa Supabase Auth para cadastro por e-mail/senha, login persistente e recuperação de senha. O login fica intencionalmente inativo até o projeto ser configurado.

## 1. Criar o projeto

1. Abra [Supabase Dashboard](https://supabase.com/dashboard) e crie um projeto.
2. Em **Authentication → Sign In / Providers**, habilite o provedor **Email**. Recomendo manter a confirmação de e-mail ativada.
3. Em **Authentication → URL Configuration**, adicione esta URL à lista de Redirect URLs:

   `https://chebensonsaintcyr-svg.github.io/axo-studio-ai/`

4. Em **Project Settings / Connect**, copie o **Project URL** e a **Publishable key** (ou a chave `anon` legada).

## 2. Configurar o navegador

Edite `auth-config.js` no repositório e preencha:

```js
window.AXO_AUTH_CONFIG = Object.freeze({
  projectUrl: "https://SEU-PROJETO.supabase.co",
  publishableKey: "SUA_CHAVE_PUBLISHABLE"
});
```

A Publishable/anon key foi feita para uso no browser. Mesmo assim, políticas RLS são necessárias para qualquer tabela de dados que venha a ser adicionada. **Nunca use a chave `service_role`, senha do banco ou outra chave secreta no arquivo público.**

## 3. Proteger a API do Cloudflare Worker

No Cloudflare Dashboard, abra o Worker `axo-studio-ai-api` → **Settings → Variables and Secrets**. Configure:

- `SUPABASE_URL`: o mesmo Project URL.
- `SUPABASE_ANON_KEY`: a mesma Publishable/anon key.
- Preserve `GEMINI_API_KEY` como Secret.

O Worker valida cada token de acesso consultando o endpoint `/auth/v1/user` do Supabase e recusa pedidos sem sessão válida. A senha não é enviada ao Worker nem armazenada pelo AXO.

## 4. Publicar e testar

1. Faça commit de `auth-config.js` preenchido e aguarde o GitHub Pages publicar.
2. Publique o Worker com o arquivo atualizado `api/gemini-worker.js`. O workflow **Deploy AXO API Worker** exige os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no repositório.
3. Abra o site e teste criar conta, confirmar e-mail, entrar, sair e recuperar senha.
4. Confirme que a API responde **401** quando um pedido não contém um token válido e que a geração funciona depois do login.

## O que está incluso

- Cadastro com e-mail e senha.
- Entrar e sair da conta.
- Sessão persistente no navegador.
- Recuperação e redefinição de senha por e-mail.
- Proteção da API de campanhas e narração por token validado no servidor.
- A tela de exemplo fica disponível sem conta; chamadas reais de IA exigem login.

As campanhas recentes ainda ficam no armazenamento local daquele navegador; ainda não são sincronizadas entre dispositivos/contas.
