# DOMINIUS

Protótipo local de um jogo de estratégia por turnos para navegador, com facções originais, tabuleiro modular e sistema de peças ocultas.

## A Guerra dos Reinos

## Como executar

1. Abra a pasta do projeto no VS Code.
2. Inicie um servidor local simples com:
   `python -m http.server 8000`
3. Acesse `http://localhost:8000` no navegador.

## Estrutura

- `index.html`: estrutura da interface principal.
- `styles.css`: identidade visual e layout do jogo.
- `app.js`: lógica do tabuleiro, turnos, peças, movimentos e vitória.

## Como jogar

1. Escolha duas facções.
2. Clique em `Jogar`.
3. Selecione uma peça do jogador ativo.
4. Clique em uma casa válida para mover.
5. Ao entrar em confronto, a peça com maior força vence.
6. Capturar o objetivo secreto da facção adversária encerra a partida.

## Observações

Este é um protótipo local para validar a arquitetura inicial. Em etapas futuras, o projeto pode ser expandido com multiplayer online, mapas adicionais, animações, efeitos sonoros e regras avançadas.
