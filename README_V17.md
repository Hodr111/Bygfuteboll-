# PFC V17 — Tudo que cabe na fundação

## O que entrou
- Backend próprio Node/Express.
- SQLite persistente.
- Google OAuth preparado, sem Firebase.
- ID PFC único por conta.
- Perfil, Gold, Gemas, XP, nível, vitórias, derrotas, empates, gols e pênaltis persistidos.
- Inventário de cartas persistente.
- Resultado de partida salvo no servidor.
- Ranking global.
- WebSocket base para salas realtime.
- Sessão com token aleatório armazenado somente como hash no banco.
- `.env.example` e `.gitignore` para não vazar segredos.
- Frontend preparado para conversar com a API.

## Rodar
1. `npm install`
2. copie `.env.example` para `.env`
3. `npm start`
4. abra `http://localhost:3000`

## Google
Crie um OAuth Client ID do tipo Web Application e configure `GOOGLE_CLIENT_ID` no `.env`. O segredo permanece somente no backend. Não coloque `client_secret.json` ou `.env` no GitHub.

A arquitetura segue o princípio de manter autenticação e estado sensível no servidor, em vez de confiar no cliente. Para multiplayer competitivo, a evolução correta é servidor autoritativo, matchmaking e servidores de jogo dedicados.
