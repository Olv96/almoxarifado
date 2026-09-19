/**
 * SUPABASE CLIENT & REALTIME SYNC ENGINE
 * Gerencia a comunicação com o banco de dados Supabase na nuvem e sincronização em tempo real.
 */

const SUPABASE_CONFIG_KEY = 'almoxarifado_supabase_config_v1';

// Credenciais permanentes do projeto Supabase (Conexão automática em qualquer dispositivo)
const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://qxorgqajvfhohtrydjyu.supabase.co',
  anonKey: 'sb_publishable_8UMLxEFXmShgZp1m2NOXkA_8zEPIchS'
};

const SupabaseService = {
  client: null,
  realtimeChannel: null,
  isConnected: false,

  // Obtém configurações salvas no navegador ou usa as credenciais padrão do projeto
  getConfig() {
    try {
      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.offline) {
          return { url: '', anonKey: '', offline: true };
        }
        if (parsed.url && parsed.anonKey) return parsed;
      }
    } catch (e) {
      console.warn('Erro ao carregar config Supabase:', e);
    }
    return { ...DEFAULT_SUPABASE_CONFIG };
  },

  // Salva configurações
  saveConfig(url, anonKey) {
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({
      url: url.trim(),
      anonKey: anonKey.trim(),
      offline: false
    }));
  },

  // Limpa configurações (marca como modo local offline explícito)
  clearConfig() {
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({
      url: '',
      anonKey: '',
      offline: true
    }));
    this.client = null;
    this.isConnected = false;
  },

  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.url && cfg.anonKey && !cfg.offline);
  },

  // Inicializa o cliente do Supabase
  init() {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.anonKey) {
      this.isConnected = false;
      return false;
    }

    if (typeof window.supabase === 'undefined') {
      console.warn('SDK do Supabase ainda não carregada via CDN.');
      this.isConnected = false;
      return false;
    }

    try {
      this.client = window.supabase.createClient(cfg.url, cfg.anonKey);
      this.isConnected = true;
      return true;
    } catch (err) {
      console.error('Falha ao inicializar Supabase:', err);
      this.isConnected = false;
      return false;
    }
  },

  // Testa conexão com o banco
  async testConnection(url, anonKey) {
    if (typeof window.supabase === 'undefined') {
      throw new Error('Biblioteca Supabase não encontrada no navegador.');
    }

    try {
      const testClient = window.supabase.createClient(url.trim(), anonKey.trim());
      const { data, error } = await testClient.from('streets').select('id').limit(1);
      if (error) throw error;
      return true;
    } catch (err) {
      throw new Error(err.message || 'Não foi possível conectar ao Supabase.');
    }
  },

  // Carrega todos os dados do Supabase
  async fetchAllData() {
    if (!this.client) return null;

    try {
      const [streetsRes, slotsRes, movementsRes, catalogRes] = await Promise.all([
        this.client.from('streets').select('*').order('id', { ascending: true }),
        this.client.from('slots').select('*'),
        this.client.from('movements').select('*').order('created_at', { ascending: false }).limit(200),
        this.client.from('catalog').select('*').order('code', { ascending: true })
      ]);

      if (streetsRes.error) throw streetsRes.error;
      if (slotsRes.error) throw slotsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (catalogRes.error) throw catalogRes.error;

      // Converter slots para o formato de objeto do appState.slots
      const slotsMap = {};
      (slotsRes.data || []).forEach(row => {
        slotsMap[row.id] = {
          streetId: row.street_id,
          code: row.code,
          items: row.items || []
        };
      });

      // Mapear ruas
      const streets = (streetsRes.data || []).map(row => ({
        id: row.id,
        name: row.name,
        baysCount: row.bays_count,
        levels: row.levels || ['B', 'A']
      }));

      // Mapear movimentações
      const movements = (movementsRes.data || []).map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        streetId: row.street_id,
        streetName: row.street_name,
        slotCode: row.slot_code,
        productName: row.product_name,
        quantity: row.quantity,
        lot: row.lot,
        docNumber: row.doc_number,
        notes: row.notes
      }));

      // Mapear catálogo
      const catalog = (catalogRes.data || []).map(row => ({
        code: row.code,
        description: row.description
      }));

      return {
        streets: streets.length > 0 ? streets : null,
        slots: slotsMap,
        movements: movements,
        catalog: catalog
      };
    } catch (err) {
      console.error('Erro ao buscar dados do Supabase:', err);
      return null;
    }
  },

  // Sobe o estado local para o Supabase (migração inicial)
  async syncLocalToRemote(state) {
    if (!this.client) throw new Error('Supabase não conectado.');

    // 1. Ruas
    if (state.streets && state.streets.length > 0) {
      const rows = state.streets.map(s => ({
        id: s.id,
        name: s.name,
        bays_count: s.baysCount || 4,
        levels: s.levels || ['B', 'A']
      }));
      await this.client.from('streets').upsert(rows, { onConflict: 'id' });
    }

    // 2. Vagas
    if (state.slots) {
      const slotRows = Object.keys(state.slots).map(key => {
        const s = state.slots[key];
        return {
          id: key,
          street_id: s.streetId,
          code: s.code,
          items: s.items || []
        };
      });
      if (slotRows.length > 0) {
        await this.client.from('slots').upsert(slotRows, { onConflict: 'id' });
      }
    }

    // 3. Movimentações
    if (state.movements && state.movements.length > 0) {
      const movRows = state.movements.slice(0, 100).map(m => ({
        id: m.id,
        timestamp: m.timestamp,
        type: m.type,
        street_id: m.streetId,
        street_name: m.streetName,
        slot_code: m.slotCode,
        product_name: m.productName,
        quantity: m.quantity,
        lot: m.lot,
        doc_number: m.docNumber,
        notes: m.notes
      }));
      await this.client.from('movements').upsert(movRows, { onConflict: 'id' });
    }

    // 4. Catálogo
    if (state.catalog && state.catalog.length > 0) {
      const catRows = state.catalog.map(c => ({
        code: c.code,
        description: c.description
      }));
      await this.client.from('catalog').upsert(catRows, { onConflict: 'code' });
    }

    return true;
  },

  // Atualizar uma vaga individual no Supabase
  async upsertSlot(streetId, code, items) {
    if (!this.client) return;
    const slotId = `${streetId}_${code}`;
    try {
      await this.client.from('slots').upsert({
        id: slotId,
        street_id: streetId,
        code: code,
        items: items || [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (err) {
      console.warn('Erro ao salvar vaga no Supabase:', err);
    }
  },

  // Registrar movimentação no Supabase
  async insertMovement(mov) {
    if (!this.client) return;
    try {
      await this.client.from('movements').insert({
        id: mov.id,
        timestamp: mov.timestamp,
        type: mov.type,
        street_id: mov.streetId,
        street_name: mov.streetName,
        slot_code: mov.slotCode,
        product_name: mov.productName,
        quantity: mov.quantity,
        lot: mov.lot,
        doc_number: mov.docNumber,
        notes: mov.notes
      });
    } catch (err) {
      console.warn('Erro ao salvar movimentação no Supabase:', err);
    }
  },

  // Atualizar ou criar Rua no Supabase
  async upsertStreet(street) {
    if (!this.client) return;
    try {
      await this.client.from('streets').upsert({
        id: street.id,
        name: street.name,
        bays_count: street.baysCount || 4,
        levels: street.levels || ['B', 'A'],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (err) {
      console.warn('Erro ao salvar rua no Supabase:', err);
    }
  },

  // Excluir Rua no Supabase
  async deleteStreet(streetId) {
    if (!this.client) return;
    try {
      await this.client.from('slots').delete().eq('street_id', streetId);
      await this.client.from('streets').delete().eq('id', streetId);
    } catch (err) {
      console.warn('Erro ao excluir rua no Supabase:', err);
    }
  },

  // Inserir itens no catálogo em lote
  async bulkUpsertCatalog(items) {
    if (!this.client || !items || items.length === 0) return;
    try {
      const rows = items.map(it => ({
        code: it.code,
        description: it.description,
        updated_at: new Date().toISOString()
      }));
      // Enviar em blocos de 200
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        await this.client.from('catalog').upsert(chunk, { onConflict: 'code' });
      }
    } catch (err) {
      console.warn('Erro ao sincronizar catálogo no Supabase:', err);
    }
  },

  // Excluir item do catálogo no Supabase
  async deleteCatalogItem(code) {
    if (!this.client) return;
    try {
      await this.client.from('catalog').delete().eq('code', code);
    } catch (err) {
      console.warn('Erro ao excluir item do catálogo no Supabase:', err);
    }
  },

  // Limpar todo o catálogo no Supabase
  async clearCatalog() {
    if (!this.client) return;
    try {
      await this.client.from('catalog').delete().neq('code', '__NONE__');
    } catch (err) {
      console.warn('Erro ao limpar catálogo no Supabase:', err);
    }
  },

  // Limpa permanentemente todos os registros de vagas, movimentações e catálogo no Supabase
  async clearAllData() {
    if (!this.client) return false;
    try {
      const [slotsDel, movDel, catDel] = await Promise.all([
        this.client.from('slots').delete().neq('id', '__NONE__'),
        this.client.from('movements').delete().neq('id', '__NONE__'),
        this.client.from('catalog').delete().neq('code', '__NONE__')
      ]);
      if (slotsDel.error) throw slotsDel.error;
      if (movDel.error) throw movDel.error;
      if (catDel.error) throw catDel.error;
      return true;
    } catch (err) {
      console.error('Erro ao limpar dados no Supabase:', err);
      throw new Error(err.message || 'Erro ao deletar dados do banco Supabase.');
    }
  },

  // ===========================================================================
  // REALTIME WEBSOCKETS (Sincronização em tempo real entre computadores)
  // ===========================================================================
  subscribeRealtime(onRemoteChange) {
    if (!this.client) return;

    if (this.realtimeChannel) {
      this.client.removeChannel(this.realtimeChannel);
    }

    this.realtimeChannel = this.client
      .channel('almoxarifado-realtime-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, (payload) => {
        onRemoteChange('slots', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'streets' }, (payload) => {
        onRemoteChange('streets', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, (payload) => {
        onRemoteChange('movements', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog' }, (payload) => {
        onRemoteChange('catalog', payload);
      })
      .subscribe((status) => {
        console.log('Status da assinatura Realtime Supabase:', status);
      });
  }
};

window.SupabaseService = SupabaseService;
