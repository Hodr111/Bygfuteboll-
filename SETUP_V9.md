# Pocket Football FC V9 — Google + E-mail OTP + PostgreSQL

## 1. Criar o projeto
Crie um projeto no Supabase. O banco e o Auth ficam no mesmo projeto.

## 2. Banco
Abra o SQL Editor e execute **todo o `schema.sql`**.

## 3. Google Login
No Google Cloud/Google Auth Platform:
- crie um OAuth Client para Web;
- adicione a URL do seu GitHub Pages em Authorized JavaScript origins;
- use como redirect URI a callback mostrada no provedor Google do Supabase;
- copie Client ID/Secret para o provedor Google do Supabase.

No Supabase, habilite Authentication → Providers → Google.

## 4. Configurar o site
Edite `supabase-config.js`:
- `url`: URL do projeto Supabase;
- `anonKey`: chave publicável do projeto.

Nunca coloque `service_role` no navegador.

## 5. Código por e-mail
A V9 usa o OTP de e-mail do Supabase. Para receber um **código de 6 dígitos**, altere o template de e-mail para usar `{{ .Token }}` em vez de `{{ .ConfirmationURL }}`.

O botão de recuperação usa `signInWithOtp` e depois `verifyOtp`.

### Remetente
Você pode usar `hostbygdeall@gmail.com` como endereço do jogo se configurar um provedor SMTP autorizado para envio. Não coloque a senha da conta no JavaScript. Para produção, é melhor usar um serviço SMTP transacional com domínio do jogo.

## 6. Recuperação
O campo de e-mail está configurado como recuperação/acesso por OTP. A V9 usa `shouldCreateUser: false` para não criar uma conta nova acidentalmente durante recuperação.

## 7. Cartas
A V9 possui um catálogo de jogadores reais com nomes e posições. Isso é apenas um catálogo de protótipo: nomes/estatísticas não significam licença de uso de imagem, escudo, uniforme ou marca. Para comercializar cartas com likeness, fotos, logos ou dados licenciados, obtenha os direitos necessários.

## 8. GitHub Pages
Publique os arquivos estáticos. Depois coloque o domínio publicado nas URLs autorizadas do Supabase/Google.
