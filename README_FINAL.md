# Pocket Football FC MAX — FINAL

## Incluído
- jogo mobile/desktop e estádio em perspectiva 3D
- jogadores, bola, passe, chute, sprint e placar
- cartas/OVR/coleção/elenco/formações/química
- progressão, Gold, Gemas, XP, níveis, recompensas
- Top Global
- conta Google preparada sem Firebase
- ID PFC persistente
- backend Node/Express + SQLite
- inventário persistente
- WebSocket base
- loja reservada em branco (ativação futura)
- painel ADM protegido por autorização no servidor
- usuários, banimento, economia, configurações, manutenção, matchmaking, avisos e auditoria
- `.env.example` e `.gitignore`

## Instalação
```bash
npm install
cp .env.example .env
npm start
```

## Google
Configure `GOOGLE_CLIENT_ID` no `.env`. O segredo fica somente no backend.

## Primeiro admin
Defina `ADMIN_BOOTSTRAP_SECRET` no ambiente do servidor. Depois de uma conta Google criada, o endpoint de bootstrap pode promover o usuário pelo `googleSub`. Remova/rotacione o segredo após o bootstrap.

## GitHub
Não envie `.env`, banco SQLite, `node_modules` ou credenciais.

## Segurança
O painel ADM não depende de esconder botão no frontend: a API verifica o papel `admin` no servidor. Isso segue o princípio de negar por padrão e validar autorização em cada requisição. (OWASP Authorization / Broken Access Control guidance)

A auditoria registra ações administrativas. O projeto também separa a lógica privilegiada do cliente; esconder apenas a interface não seria proteção suficiente. (OWASP secure code review / admin-interface guidance)
