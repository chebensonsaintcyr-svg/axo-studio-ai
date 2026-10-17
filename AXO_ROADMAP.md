# AXO Studio AI — estabilidade e preparação para crescer

Este documento é o checklist operacional do projeto. Ele descreve o estado do código, não afirma que configurações externas já foram aplicadas.

## Arquitetura identificada no repositório

- **Frontend:** página estática publicada pelo GitHub Pages.
- **Autenticação:** Supabase Auth com e-mail/senha, confirmação e recuperação.
- **API de IA:** Cloudflare Worker que valida a sessão Supabase antes de chamar o Gemini.
- **Campanhas salvas:** atualmente ficam no armazenamento local do navegador; não são sincronizadas entre dispositivos ou contas.
- **Vídeo:** renderização no navegador; requer suporte do Chrome/Edge a Canvas, MediaRecorder e áudio.

## Próximas prioridades

### P0 — cadastro e acesso
- [ ] Configurar SMTP personalizado no Supabase e validar domínio/remetente.
- [ ] Testar cadastro, e-mail de confirmação, login, logout e recuperação de senha com endereços de teste autorizados.
- [ ] Confirmar que o endereço de retorno do Supabase corresponde ao domínio publicado.
- [ ] Verificar no painel se CAPTCHA está habilitado para cadastro/login/recuperação antes de abrir o cadastro amplamente.
- [ ] Manter todas as senhas e chaves privadas fora do repositório.

### P1 — segurança e custo antes de divulgar
- [ ] Configurar limitação de tráfego no Cloudflare no nível da plataforma. A proteção em memória do Worker é apenas uma defesa básica e não deve ser considerada limite persistente entre instâncias.
- [ ] Definir um limite mensal e alertas de uso para a API de IA e a narração.
- [ ] Testar os endpoints com sessão ausente, inválida e expirada, origem inválida e corpo de requisição grande.
- [ ] Rever logs e mensagens de erro para não revelar credenciais ou dados internos.

### P2 — experiência do produto
- [ ] Decidir se o histórico de campanhas deve continuar local ou ser sincronizado na conta.
- [ ] Se for sincronizado, criar tabelas com RLS e políticas por usuário antes de gravar dados pessoais.
- [ ] Testar mobile, acessibilidade, estados de carregamento, erros de rede e recuperação após falhas.
- [ ] Validar manualmente a qualidade da campanha, os créditos/licenças de mídia e o arquivo de vídeo exportado.

## Critério de liberação

Não declarar o AXO “pronto para escalar” apenas porque o site abre. Avançar de etapa somente depois de concluir os testes correspondentes e conferir a configuração real nos painéis do Supabase e Cloudflare. Nenhuma tarefa deste documento altera serviços externos por si só.
