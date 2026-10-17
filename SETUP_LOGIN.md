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

Importante: o link de confirmação e o link de recuperação devem voltar para o site público do AXO, não para `localhost:3000` nem para o endereço temporário do ambiente de desenvolvimento. O código usa como retorno fixo `https://chebensonsaintcyr-svg.github.io/axo-studio-ai/`. Em **Authentication → URL Configuration**, confirme que esse endereço está definido como **Site URL** e incluído em **Redirect URLs**.

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

## Se só chegam 2 e-mails por hora

Isso não significa que o AXO só aceita duas contas. O serviço de e-mail padrão do Supabase tem um limite global de **2 mensagens por hora** para confirmações, recuperação de senha e outros e-mails de autenticação. Alterar o código do site não aumenta essa cota.

Para permitir mais cadastros:

1. Escolha um serviço de e-mail transacional que ofereça SMTP.
2. Verifique o domínio/remetente no provedor e publique os registros DNS que ele solicitar (por exemplo, SPF e DKIM).
3. No Supabase, abra **Authentication → Emails → SMTP Settings**, habilite o SMTP personalizado e preencha host, porta, usuário, senha e remetente.
4. Guarde as credenciais apenas no painel de configurações do Supabase — **nunca no HTML, no GitHub, em capturas de tela ou neste chat**.
5. Envie um teste de confirmação e outro de recuperação de senha. Só depois ajuste **Authentication → Rate Limits** para um volume compatível com o serviço escolhido e com o estágio do AXO.

O limite por usuário entre solicitações sucessivas também existe; se o Supabase pedir para aguardar alguns segundos, espere o intervalo exibido antes de solicitar outro link. Não fique tentando repetidamente, pois isso pode consumir a cota.

## O que está incluso

- Cadastro com e-mail e senha.
- Entrar e sair da conta.
- Sessão persistente no navegador.
- Recuperação e redefinição de senha por e-mail.
- Estúdio de narrações dos três Reels AXO: gera três faixas com a voz Fenrir e estilo masculino energético; requer sessão autenticada e disponibiliza pré-visualização/download no navegador.
- Proteção da API de campanhas e narração por token validado no servidor.
- A tela de exemplo fica disponível sem conta; chamadas reais de IA exigem login.

As campanhas recentes e a preferência de tema ficam no armazenamento local do navegador, usando chaves separadas por ID de usuário autenticado (ou uma área de visitante). Isso evita que o AXO misture o histórico e o tema de contas diferentes na interface do mesmo navegador. Esses dados ainda não são sincronizados com a nuvem e não são protegidos por políticas RLS no banco, porque ainda não são guardados numa tabela Supabase. Para sincronizar entre dispositivos e ter isolamento validado pelo servidor, será necessário criar uma tabela própria com Row Level Security (RLS).
