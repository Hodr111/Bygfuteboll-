# Pocket Football FC V8 — Google + Banco online sem Firebase

A V8 usa **Supabase Auth + PostgreSQL**. Não usa Firebase.

## 1. Criar o backend
1. Crie um projeto em Supabase.
2. Abra **SQL Editor** e execute `schema.sql` inteiro.
3. Em Authentication → Providers → Google, ative Google.
4. No Google Cloud, crie um OAuth Client do tipo Web.
5. Configure no Google as origens autorizadas e o callback informado pelo Supabase.
6. No Supabase, coloque a Client ID/Secret do Google.

## 2. Configurar o jogo
Copie:
`supabase-config.example.js` → `supabase-config.js`

Preencha:
- `url`: URL do projeto Supabase
- `anonKey`: chave publicável do projeto

A chave publicável/anon é própria para o frontend quando as políticas RLS estão corretas. **Nunca coloque service_role/secret no navegador.**

## 3. Publicar
O frontend pode ficar no GitHub Pages. O banco/autenticação ficam no Supabase.

## 4. O que fica permanente
A conta Google identifica o usuário. O banco guarda:
- ID PF próprio
- nome/clube
- uniforme e avatar escolhido
- Gold/Gems
- OVR/XP
- cartas
- estádio/química
- partidas
- vitórias/derrotas/empates
- gols/assistências/pênaltis
- ranking

Entrando novamente com o mesmo Google, o jogador recupera o mesmo perfil.

## 5. Segurança
- Google OAuth é feito pelo Supabase Auth.
- RLS impede um usuário de ler/escrever o perfil de outro.
- Gold/Gems/estatísticas importantes não devem ser aceitos como edição direta do cliente.
- Resultado da partida é enviado para `record_match`, uma função do banco que calcula as recompensas.
- Não há upload de foto: avatar é escolhido entre opções pré-definidas.

## 6. Importante
Para a versão de produção, a lógica de partida deve migrar progressivamente para um servidor autoritativo/matchmaking. A V8 já separa a operação de persistência e ranking para esse próximo passo.
