# 📦 Sistema de Endereçamento de Almoxarifado

Sistema moderno, visual e interativo desenvolvido sob medida para controle de estoque, endereçamento físico e gestão de paletes em prateleiras industriais.

---

## 🚀 Como Executar

Não é necessário instalar nenhum programa extra (Node.js ou Python). O sistema roda direto no seu navegador:

1. Acesse a pasta: `C:\Users\bruni\.gemini\antigravity\scratch\almoxarifado\`
2. Dê **dois cliques** no arquivo `index.html` (ou abra no Google Chrome, Microsoft Edge, Brave, etc.).
3. O sistema já vem com dados de exemplo prontos para testar!

---

## 🏗️ Como Funciona o Layout do Armazém

### 1. Ruas Dinâmicas
- Você pode navegar entre as ruas pelos botões do topo: **Rua 1**, **Rua 2**, **Rua 3**, etc.
- **➕ Nova Rua**: Adiciona instantaneamente uma nova rua com prateleiras configuradas.
- **📐 Ajustar Vagas**: Permite renomear a rua ou aumentar/diminuir o número de vãos (módulos da prateleira).

### 2. Prateleiras com Vãos Duplos
Conforme solicitado, cada quadrado/vão da prateleira comporta **2 vagas horizontais**:
- **Nível B (Andar Superior)**: `B1, B2` | `B3, B4` | `B5, B6` | `B7, B8`...
- **Nível A (Andar Inferior / Térreo)**: `A1, A2` | `A3, A4` | `A5, A6` | `A7, A8`...

---

## 🏷️ Cores e Status das Vagas

| Status | Cor | Descrição |
| :--- | :---: | :--- |
| **🟢 Vazia** | Verde | Posição livre, pronta para receber novo palete. |
| **🔵 1 Produto** | Azul | Palete padrão com 1 tipo de material armazenado. |
| **🟠 Palete Misto** | Laranja / Âmbar | **Destaque visual:** Vaga com **2 produtos diferentes** dividindo o mesmo palete. |

---

## 📋 Movimentações e Regras de Segurança

Ao clicar em qualquer vaga no mapa ou no botão **"➕ Nova Movimentação"**:

### 1. 📥 Entrada
- Informe o **Endereço** (Rua e Vaga), **Produto**, **Quantidade**, **Lote** (caso haja) e o **Nº da Solicitação / NF**.
- A data e a hora são registradas **automaticamente com precisão de segundos**.
- **Regra de Palete Misto**: Se a vaga já tiver 2 produtos diferentes, o sistema avisa e orienta a armazenar em uma vaga livre.

### 2. 📤 Saída (com trava contra erros)
- Selecione o produto da vaga no seletor dinâmico.
- **Auxílio em casos de erro**: O sistema verifica o saldo atual daquele produto na vaga. Se você tentar dar baixa em uma quantidade maior do que existe no palete, o sistema **bloqueia a operação** e avisa o saldo exato disponível!
- Quando toda a quantidade é baixada, a vaga volta a ficar **🟢 Vazia automaticamente**.

### 3. 🛠️ Correção
- Se houve digitação errada na entrada ou ajuste de inventário físico, selecione o modo **Correção**.
- Permite ajustar o saldo e lote, exigindo a justificativa/motivo para registrar no histórico de auditoria.

---

## 📚 Catálogo Base de Produtos & Auto-preenchimento

O sistema conta com um recurso para importar sua planilha base de produtos (**Coluna A: Código**, **Coluna B: Descrição**):

### Como importar sua planilha:
1. Clique no botão **"📚 Catálogo"** no topo da tela.
2. Você pode escolher entre:
   - **Colar direto do Excel (Recomendado):** Selecione as duas colunas (Código e Descrição) na sua planilha do Excel, pressione `Ctrl+C`, cole na caixa de texto com `Ctrl+V` e clique em **"⚡ Importar Texto Colado"**.
   - **Arquivo CSV:** Salve sua planilha como `.csv` e clique na área de upload.

### Auto-preenchimento na Entrada de Produtos:
- Ao abrir o formulário de **Entrada**, comece a digitar qualquer parte do **código** (ex: `1040`) ou do **nome** do produto.
- O sistema exibirá uma lista de sugestões suspensa em tempo real.
- Basta clicar no item ou usar as **setas do teclado (↑/↓) e Enter** para selecionar: o nome e o código serão preenchidos automaticamente!

---

## 🔍 Ferramentas de Produtividade

- **🔍 Busca Global**: Digite o nome de qualquer produto, código de lote ou endereço (ex: `A3` ou `Parafuso`) no campo de busca do cabeçalho. Ao clicar no resultado, o sistema te leva direto para a rua e pisca a vaga na tela!
- **📋 Histórico de Auditoria**: Veja todas as movimentações já feitas, filtre por tipo (Entrada/Saída/Correção) ou rua, e clique em **"Exportar CSV"** para abrir no Excel.
- **💾 Backup & Restauração**: Pelo ícone da engrenagem ⚙️, baixe um backup dos seus dados em arquivo `.json` para nunca perder o cadastro do armazém.
