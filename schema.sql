-- =============================================================================
-- SISTEMA DE ENDEREÇAMENTO DE ALMOXARIFADO - BANCO DE DADOS SUPABASE
-- Execute este script no "SQL Editor" do seu painel Supabase
-- =============================================================================

-- 1. TABELA DE RUAS (Configuração física de prateleiras e vãos)
create table if not exists public.streets (
    id text primary key,
    name text not null,
    bays_count integer default 4,
    levels jsonb default '["B", "A"]'::jsonb,
    updated_at timestamptz default now()
);

-- 2. TABELA DE VAGAS (Produtos, lotes e saldos em cada posição)
create table if not exists public.slots (
    id text primary key, -- Chave única: ex 'street_1_A1'
    street_id text not null,
    code text not null,
    items jsonb default '[]'::jsonb, -- Array de [{ productName, quantity, lot }]
    updated_at timestamptz default now()
);

-- 3. TABELA DE MOVIMENTAÇÕES (Histórico de Auditoria de Entradas, Saídas e Correções)
create table if not exists public.movements (
    id text primary key,
    timestamp text not null,
    type text not null, -- 'ENTRADA', 'SAIDA' ou 'CORRECAO'
    street_id text,
    street_name text,
    slot_code text,
    product_name text,
    quantity integer default 1,
    lot text,
    doc_number text,
    notes text,
    created_at timestamptz default now()
);

-- 4. TABELA DO CATÁLOGO BASE (Códigos e Descrições para Auto-preenchimento)
create table if not exists public.catalog (
    code text primary key, -- Coluna A da sua planilha
    description text not null, -- Coluna B da sua planilha
    updated_at timestamptz default now()
);

-- =============================================================================
-- SEGURANÇA (Row Level Security - RLS)
-- Permite que o frontend acesse e atualize os dados usando a chave pública (anon)
-- =============================================================================

alter table public.streets enable row level security;
alter table public.slots enable row level security;
alter table public.movements enable row level security;
alter table public.catalog enable row level security;

-- Políticas para 'streets'
create policy "Acesso público total a streets" on public.streets 
    for all using (true) with check (true);

-- Políticas para 'slots'
create policy "Acesso público total a slots" on public.slots 
    for all using (true) with check (true);

-- Políticas para 'movements'
create policy "Acesso público total a movements" on public.movements 
    for all using (true) with check (true);

-- Políticas para 'catalog'
create policy "Acesso público total a catalog" on public.catalog 
    for all using (true) with check (true);

-- =============================================================================
-- HABILITAR SINCRONIZAÇÃO EM TEMPO REAL (REALTIME)
-- Permite que vários computadores/celulares vejam as alterações instantaneamente
-- =============================================================================

alter publication supabase_realtime add table public.streets;
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.movements;
alter publication supabase_realtime add table public.catalog;

-- =============================================================================
-- DADOS INICIAIS DE EXEMPLO (Caso o banco esteja vazio)
-- =============================================================================

insert into public.streets (id, name, bays_count, levels) values
('street_1', 'Rua 1', 4, '["B", "A"]'::jsonb),
('street_2', 'Rua 2', 4, '["B", "A"]'::jsonb),
('street_3', 'Rua 3', 3, '["B", "A"]'::jsonb)
on conflict (id) do nothing;

insert into public.slots (id, street_id, code, items) values
('street_1_A1', 'street_1', 'A1', '[{"productName": "Parafuso Sextavado M8x25", "quantity": 350, "lot": "LOTE-2401"}]'::jsonb),
('street_1_A3', 'street_1', 'A3', '[{"productName": "Fita Adesiva Kraft 48mm", "quantity": 80, "lot": "FT-889"}, {"productName": "Filme Stretch 500mm", "quantity": 24, "lot": "FS-102"}]'::jsonb),
('street_1_A4', 'street_1', 'A4', '[{"productName": "Etiquetas Térmicas 100x150", "quantity": 120, "lot": "ET-9901"}]'::jsonb),
('street_1_B1', 'street_1', 'B1', '[{"productName": "Caixa de Papelão 40x30x20", "quantity": 500, "lot": "CX-331"}]'::jsonb)
on conflict (id) do nothing;

insert into public.catalog (code, description) values
('1001', 'Parafuso Sextavado M8x25 Zincado'),
('1002', 'Fita Adesiva Kraft 48mm'),
('1003', 'Filme Stretch 500mm 25mic'),
('1004', 'Caixa de Papelão 40x30x20 Triplex'),
('1005', 'Etiquetas Térmicas 100x150 Adesivas'),
('1006', 'Bobina Plástica Bolha 1.20x100m'),
('1007', 'Palete PBR Madeira 1000x1200')
on conflict (code) do nothing;
