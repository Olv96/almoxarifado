# 🚀 Guia Completo: Publicando no GitHub Pages com Supabase

Este guia ensina o passo a passo para colocar o seu **Sistema de Endereçamento de Almoxarifado** no ar na internet gratuitamente, permitindo que você e sua equipe usem o sistema em **qualquer computador, celular ou tablet**, com banco de dados seguro e **atualização em tempo real**!

---

## 📋 Resumo das Ferramentas
- **GitHub Pages**: Hospeda a página web de graça com link público seguro (HTTPS).
- **Supabase**: Banco de dados PostgreSQL gratuito na nuvem com WebSockets (quando alguém dá baixa em um palete pelo celular, a tela do computador atualiza na mesma hora sem precisar de F5).

---

## 🗄️ PARTE 1: Configurar o Banco de Dados no Supabase

### 1. Criar a Conta e o Projeto no Supabase
1. Acesse: **[supabase.com](https://supabase.com/)** e clique em **"Start your project"** (ou faça login com sua conta do GitHub/Google).
2. Clique no botão **"New project"**.
3. Preencha os dados:
   - **Name**: `almoxarifado` (ou o nome que preferir).
   - **Database Password**: Escolha uma senha forte e anote.
   - **Region**: Selecione `South America (São Paulo)` para ter a menor latência.
4. Clique em **"Create new project"** e aguarde cerca de 1 a 2 minutos enquanto o banco é provisionado.

---

### 2. Criar as Tabelas com 1 Clique (Executar o SQL)
1. No menu lateral esquerdo do Supabase, clique no ícone **SQL Editor** (ícone de prompt `>_`).
2. Clique no botão verde **"+ New query"**.
3. Abra o arquivo **`schema.sql`** que está na pasta do seu projeto (`C:\Users\bruni\.gemini\antigravity\scratch\almoxarifado\schema.sql`), copie **todo o conteúdo** dele e cole dentro do editor do Supabase.
4. Clique no botão verde **"Run"** (ou pressione `Ctrl + Enter`).
5. Você verá a mensagem *"Success. No rows returned"*. Pronto! As 4 tabelas (`streets`, `slots`, `movements`, `catalog`), as permissões e o Realtime já foram criados.

---

### 3. Pegar a URL e a Chave Pública do Supabase
1. No menu lateral esquerdo, clique no ícone de engrenagem **Project Settings** (na parte inferior).
2. Clique na aba **"API"**.
3. Você verá dois campos fundamentais:
   - **Project URL**: Algo como `https://xyzabcdefghijklmnop.supabase.co`
   - **Project API Keys (anon public)**: Uma chave longa começando com `eyJhbGciOi...`
4. Copie esses dois valores (deixe guardado no bloco de notas).

---

## 🌐 PARTE 2: Publicar no GitHub Pages

### 1. Criar o Repositório no GitHub
1. Acesse: **[github.com](https://github.com/)** e faça login na sua conta.
2. No topo direito, clique no **"+"** e escolha **"New repository"**.
3. Preencha:
   - **Repository name**: `almoxarifado`
   - **Public**: Deixe marcado como **Public** (necessário para o GitHub Pages gratuito).
4. Clique em **"Create repository"**.

---

### 2. Enviar os Arquivos do Projeto

Você pode enviar os arquivos de duas formas:

#### Opção A: Pelo próprio navegador (Arrastar e Soltar - Mais fácil)
1. Na página do seu repositório criado no GitHub, clique no link **"uploading an existing file"**.
2. Abra a pasta do projeto no Windows:
   `C:\Users\bruni\.gemini\antigravity\scratch\almoxarifado\`
3. Selecione os seguintes arquivos e arraste para a tela do GitHub:
   - `index.html`
   - `style.css`
   - `app.js`
   - `supabase-client.js`
   - `xlsx.full.min.js`
   - `schema.sql`
   - `README.md`
4. No rodapé da página, clique no botão verde **"Commit changes"**.

#### Opção B: Pelo Terminal / Git (caso use o Git instalado)
```bash
cd C:\Users\bruni\.gemini\antigravity\scratch\almoxarifado
git init
git add .
git commit -m "Publicação inicial do Almoxarifado Pro"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/almoxarifado.git
git push -u origin main
```

---

### 3. Ativar o GitHub Pages
1. Na página do seu repositório no GitHub, clique na aba **"Settings"** (engrenagem no topo).
2. No menu lateral esquerdo, clique em **"Pages"**.
3. Na seção **"Build and deployment"**:
   - **Source**: `Deploy from a branch`
   - **Branch**: Selecione `main` (ou `master`) e pasta `/(root)`.
4. Clique em **"Save"**.
5. Aguarde cerca de **1 a 2 minutos** e atualize a página. O GitHub exibirá uma caixa verde com o seu link oficial:
   > 🔗 **`https://seu-usuario.github.io/almoxarifado/`**

---

## 📲 PARTE 3: Conectar o Sistema com a Nuvem

1. Abra o link do seu sistema no navegador (no computador, celular ou tablet).
2. No cabeçalho superior, clique no botão **"☁️ Nuvem"** (ou no aviso amarelo **"🟡 Modo Local"**).
3. Na janela que se abre:
   - Cole a **URL do Projeto Supabase**.
   - Cole a **Chave anon public**.
4. Clique em **"🧪 Testar Conexão"** para confirmar.
5. Clique em **"💾 Salvar e Conectar"**.
6. Se quiser subir as vagas de exemplo ou dados que já cadastrou, clique em **"☁️ Enviar Estoque Local para o Supabase"**.
7. O indicador do topo mudará para **🟢 Nuvem Conectada**!

---

## ✨ Como fica no dia a dia:

- **Múltiplos Dispositivos**: Você pode abrir o link no celular de um operador no galpão e no computador da recepção/escritório.
- **Sincronização em Tempo Real**: Se alguém der baixa em um item pelo celular, a vaga na prateleira muda de cor na tela do computador instantaneamente!
- **Modo Offline Resiliente**: Se a internet do galpão cair, o operador continua usando o sistema normalmente; os dados ficam salvos localmente e podem ser sincronizados quando o sinal retornar.
- **Importação de Planilhas**: Continua funcionando 100%, permitindo carregar arquivos `.xlsx` do Excel direto pelo navegador!
