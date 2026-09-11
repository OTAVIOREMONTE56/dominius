# DOMINIUS

Protótipo local de um jogo de estratégia por turnos para navegador, com facções originais, tabuleiro modular e sistema de peças ocultas.

## A Guerra dos Reinos

## Como executar

1. Abra a pasta do projeto no VS Code.
2. Com Node.js 22 ou superior, inicie o servidor com `node server.js` (ou `npm start`).
   Nesta máquina também está disponível `.\.tools\node.exe server.js`.
3. Acesse `http://localhost:8000` no navegador.

## Estrutura

- `index.html`: estrutura da interface principal.
- `styles.css`: identidade visual e layout do jogo.
- `app.js`: lógica do tabuleiro, turnos, peças, movimentos e vitória.
- `game-rules.js`: regras compartilhadas pelos modos locais e pelo servidor.
- `server.js`: servidor HTTP e salas multiplayer, sem dependências externas.
- `multiplayer.js`: conexão, preparação e sincronização dos jogadores.

## Supabase e GitHub Pages

O site publicado usa `supabase-online.js` para salas e `account.js` para contas reais no Supabase. O adaptador antigo `multiplayer.js`, que depende de `/api/multiplayer`, não é carregado pelo `index.html` atual. GitHub Pages não executa esse servidor Node.

A URL deve ser exatamente `https://pvnhfxqvypxxiakdbctf.supabase.co`. Preserve a publishable key desse mesmo projeto em `supabase-config.js`; nunca coloque chaves secretas ou service_role no frontend. A configuração é carregada antes do cliente, que compartilha uma única instância do SDK local `vendor/supabase.js` e persiste/renova a sessão.

No painel do projeto, em Authentication → URL Configuration, configure Site URL e Redirect URLs com `https://otavioremonte56.github.io/dominius/`. Se utilizar também `/dominius/index.html`, autorize esse endereço. Isso permite o retorno dos links de confirmação e recuperação; não é uma configuração de CORS. O cadastro por e-mail deve estar habilitado. Para as salas, execute `supabase-setup.sql` no SQL Editor se ainda não instalou o esquema.

Diagnóstico de conexão: a URL anterior terminava em `iakdbcft` e falhava no DNS (`ENOTFOUND`), causando `Failed to fetch`. O commit anterior já corrigiu para `iakdbctf`. Na verificação de 11/09/2026, a configuração publicada correspondia à local, `/auth/v1/settings` aceitou a publishable key com HTTP 200 e o preflight de `/auth/v1/signup` permitiu a origem do GitHub Pages. Não foi identificado bloqueio atual de CORS. O `index.html` agora versiona a configuração para evitar o cache do endereço antigo. Se o erro persistir, verifique a requisição no navegador afetado e a disponibilidade do projeto; não use `no-cors`, pois Auth precisa ler a resposta.

### Sincronização em tempo real

O adaptador recebe eventos Postgres Changes filtrados pela sala em `matches`, `match_moves`, `room_players`, `rooms` e `chat_messages`. Eventos de partida consultam imediatamente `dominius_snapshot`, que retorna turno, posições, baixas e resultado de forma coerente e sem revelar peças inimigas. O chat consulta seu próprio histórico. `match_pieces` deve continuar fora da publicação.

No SQL Editor do projeto, confira a publicação efetiva:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';
```

As cinco tabelas acima devem constar como `public`. Caso faltem, reexecute o `supabase-setup.sql` inteiro desta versão, que configura publicação e permissões RLS. Isso é necessário para receber eventos, mesmo que as gravações REST/RPC já funcionem. Consulte [Postgres Changes no Supabase](https://supabase.com/docs/guides/realtime/postgres-changes).

O fallback anterior consultava a cada 15 segundos. Agora, o canal conectado mantém apenas reconciliação a cada 60 segundos; falhas de conexão ativam recuperação a cada 3 segundos até a reconexão. Retornar à aba ou recuperar a rede também sincroniza imediatamente. O heartbeat de 15 segundos indica presença. Erros do canal aparecem no console como `DOMINIUS Realtime`, com o motivo disponível. O SDK gerencia a reconexão e renovação do token; sair remove o canal, os timers e invalida callbacks pendentes.

Os testes de dois jogadores desabilitam os timers periódicos para verificar que movimento, turno e chat dependem dos eventos; também verificam reconexão e limpeza ao sair. Não medem a latência da infraestrutura publicada nem substituem a conferência da publicação no painel.

## Servidor multiplayer legado

1. Ambos os jogadores devem acessar o mesmo servidor. No computador que o executa, use `http://localhost:8000`. Em outro dispositivo da mesma rede, use `http://IP-DO-COMPUTADOR:8000` (a porta precisa estar acessível no firewall).
2. Clique em **Criar Sala**, escolha seu reino e compartilhe o código com o outro jogador.
3. O outro jogador clica em **Entrar em Sala**, escolhe o reino e informa o código.
4. Cada jogador organiza seu próprio exército e clica em **Confirmar Exército**. A batalha começa quando ambos confirmam.
5. **Partida Rápida** reúne dois jogadores que escolheram essa opção no mesmo servidor.

O **Chat da sala** permite enviar mensagens com Enter ou pelo botão Enviar, inclusive durante a preparação e enquanto aguarda o adversário. Cada mensagem mostra jogador e horário. O histórico guarda as últimas 100 mensagens da sala (até 500 caracteres por mensagem) e é recuperado ao recarregar a aba. Ele desaparece quando a sala expira ou o servidor reinicia.

As jogadas são validadas no servidor. A identidade das peças inimigas não é enviada ao adversário; os resultados dos confrontos aparecem no histórico. Recarregar a mesma aba recupera a sessão. Voltar ao menu encerra a sala. Para disputar outra partida, crie uma nova sala.

As salas ficam na memória, expiram após 30 minutos sem atividade e desaparecem ao reiniciar o servidor. Para jogar pela internet, é necessário hospedar este servidor em um endereço acessível aos dois jogadores. Live Server e servidores de arquivos estáticos não executam o multiplayer.

## Testes

Execute `node --test` (nesta máquina: `.\.tools\node.exe --test`).

## Como jogar

1. Escolha duas facções.
2. Clique em `Jogar`.
3. Selecione uma peça do jogador ativo.
4. Clique em uma casa válida para mover.
5. Ao entrar em confronto, a peça com maior força vence.
6. Capturar o objetivo secreto da facção adversária encerra a partida.

## Observações

Os modos local e BOT funcionam independentemente da conta e da conexão com o Supabase.
