/**
 * SISTEMA DE ENDEREÇAMENTO DE ALMOXARIFADO
 * Gestão visual de ruas, prateleiras com vãos duplos, paletes mistos e movimentações.
 */

// =============================================================================
// 1. ESTADO GLOBAL & PERSISTÊNCIA
// =============================================================================

const STORAGE_KEY = 'almoxarifado_pro_v1';

let appState = {
  activeStreetId: 'street_1',
  streetSortOrder: 'NUM_ASC', // 'NUM_ASC', 'NUM_DESC', 'ITEMS_DESC', 'ITEMS_ASC', 'ALPHA_ASC'
  streets: [],
  slots: {}, // Chave: `${streetId}_${code}`, ex: "street_1_A1"
  movements: [] // Histórico de movimentações
};

// Dados padrão iniciais (Seed)
const DEFAULT_INITIAL_STATE = {
  activeStreetId: 'street_1',
  streetSortOrder: 'NUM_ASC',
  streets: [
    { id: 'street_1', name: 'Rua 1', slotsPerLevel: 8, baysCount: 4, levels: ['B', 'A'] },
    { id: 'street_2', name: 'Rua 2', slotsPerLevel: 8, baysCount: 4, levels: ['B', 'A'] },
    { id: 'street_3', name: 'Rua 3', slotsPerLevel: 6, baysCount: 3, levels: ['B', 'A'] }
  ],
  slots: {
    // Rua 1 - Exemplos realistas
    'street_1_A1': {
      streetId: 'street_1',
      code: 'A1',
      items: [
        { productName: 'Parafuso Sextavado M8x25', quantity: 350, lot: 'LOTE-2401' }
      ]
    },
    'street_1_A2': {
      streetId: 'street_1',
      code: 'A2',
      items: [] // Vaga Vazia
    },
    'street_1_A3': {
      // Exemplo de PALETE MISTO (2 produtos)
      streetId: 'street_1',
      code: 'A3',
      items: [
        { productName: 'Fita Adesiva Kraft 48mm', quantity: 80, lot: 'FT-889' },
        { productName: 'Filme Stretch 500mm', quantity: 24, lot: 'FS-102' }
      ]
    },
    'street_1_A4': {
      streetId: 'street_1',
      code: 'A4',
      items: [
        { productName: 'Etiquetas Térmicas 100x150', quantity: 120, lot: 'ET-9901' }
      ]
    },
    'street_1_B1': {
      streetId: 'street_1',
      code: 'B1',
      items: [
        { productName: 'Caixa de Papelão 40x30x20', quantity: 500, lot: 'CX-331' }
      ]
    },
    'street_1_B2': {
      streetId: 'street_1',
      code: 'B2',
      items: []
    }
  },
  movements: [
    {
      id: 'mov_init_1',
      timestamp: '17/09/2026 08:30:15',
      type: 'ENTRADA',
      streetId: 'street_1',
      streetName: 'Rua 1',
      slotCode: 'A1',
      productName: 'Parafuso Sextavado M8x25',
      quantity: 350,
      lot: 'LOTE-2401',
      docNumber: 'NF 48921',
      notes: 'Recebimento de fornecedor metalúrgico'
    },
    {
      id: 'mov_init_2',
      timestamp: '17/09/2026 09:14:02',
      type: 'ENTRADA',
      streetId: 'street_1',
      streetName: 'Rua 1',
      slotCode: 'A3',
      productName: 'Fita Adesiva Kraft 48mm',
      quantity: 80,
      lot: 'FT-889',
      docNumber: 'Req #1089',
      notes: 'Palete misto com embalagens'
    },
    {
      id: 'mov_init_3',
      timestamp: '17/09/2026 09:20:44',
      type: 'ENTRADA',
      streetId: 'street_1',
      streetName: 'Rua 1',
      slotCode: 'A3',
      productName: 'Filme Stretch 500mm',
      quantity: 24,
      lot: 'FS-102',
      docNumber: 'Req #1089',
      notes: 'Complemento de palete misto'
    }
  ],
  catalog: [
    { code: '1001', description: 'Parafuso Sextavado M8x25 Zincado' },
    { code: '1002', description: 'Fita Adesiva Kraft 48mm' },
    { code: '1003', description: 'Filme Stretch 500mm 25mic' },
    { code: '1004', description: 'Caixa de Papelão 40x30x20 Triplex' },
    { code: '1005', description: 'Etiquetas Térmicas 100x150 Adesivas' },
    { code: '1006', description: 'Bobina Plástica Bolha 1.20x100m' },
    { code: '1007', description: 'Palete PBR Madeira 1000x1200' }
  ]
};

// Banco de Dados Local IndexedDB para suportar catálogos volumosos (20.000+ produtos)
const CatalogDB = {
  dbName: 'AlmoxarifadoCatalogDB_v1',
  storeName: 'catalog',
  db: null,

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(false);
      try {
        const req = window.indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'code' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(true);
        };
        req.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  },

  async saveAll(items) {
    if (!this.db || !Array.isArray(items)) return false;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.clear();
        for (let i = 0; i < items.length; i++) {
          store.put(items[i]);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    });
  },

  async getAll() {
    if (!this.db) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }
};

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (err) {
    console.warn('Aviso: Catálogo grande, salvando no LocalStorage sem o catálogo integral:', err);
    try {
      const lightweightState = { ...appState, catalog: appState.catalog ? appState.catalog.slice(0, 500) : [] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweightState));
    } catch (e2) {
      console.error('Erro no LocalStorage:', e2);
    }
  }

  // Persiste no IndexedDB de forma assíncrona para catálogos volumosos
  if (CatalogDB.db && appState.catalog && appState.catalog.length > 0) {
    CatalogDB.saveAll(appState.catalog);
  }
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      appState = JSON.parse(saved);
      // Garantir estrutura
      if (!appState.streets || appState.streets.length === 0) {
        appState = JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
        saveState();
      }
      if (!appState.streetSortOrder) {
        appState.streetSortOrder = 'NUM_ASC';
      }
    } catch (e) {
      console.warn('Erro ao decodificar storage, restaurando padrão:', e);
      appState = JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
      saveState();
    }
  } else {
    appState = JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
    saveState();
  }

  // Se o catálogo estiver vazio ou menor que a base pré-carregada da planilha (ex: 19.317 itens)
  if (window.PRELOADED_CATALOG && Array.isArray(window.PRELOADED_CATALOG) && window.PRELOADED_CATALOG.length > 0) {
    if (!appState.catalog || appState.catalog.length < window.PRELOADED_CATALOG.length) {
      console.log(`Carregando base completa pré-carregada com ${window.PRELOADED_CATALOG.length} produtos.`);
      appState.catalog = window.PRELOADED_CATALOG;
      saveState();
    }
  } else if (!appState.catalog || !Array.isArray(appState.catalog)) {
    appState.catalog = JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE.catalog));
    saveState();
  }

  // Inicializa IndexedDB em segundo plano e carrega versão completa caso exista
  CatalogDB.init().then(async (ok) => {
    if (ok) {
      const dbCatalog = await CatalogDB.getAll();
      if (dbCatalog && dbCatalog.length > (appState.catalog ? appState.catalog.length : 0)) {
        appState.catalog = dbCatalog;
        renderCatalogTable();
        updateCatalogHints();
      } else if (appState.catalog && appState.catalog.length > 0) {
        CatalogDB.saveAll(appState.catalog);
      }
    }
  });
}

// Retorna slot ou inicializa vazio
function getSlot(streetId, code) {
  const key = `${streetId}_${code}`;
  if (!appState.slots[key]) {
    appState.slots[key] = {
      streetId: streetId,
      code: code,
      items: []
    };
  }
  return appState.slots[key];
}

// Formata data e hora atual no padrão brasileiro DD/MM/AAAA HH:mm:ss
function formatCurrentDateTime() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

// =============================================================================
// 2. RENDERIZAÇÃO DA INTERFACE & PRATELEIRAS
// =============================================================================

// Gera lista de andares em ordem decrescente (ex: count=3 -> ['C', 'B', 'A'])
function generateLevelsList(count) {
  const n = Math.max(1, Math.min(26, parseInt(count, 10) || 2));
  const levels = [];
  for (let i = n - 1; i >= 0; i--) {
    levels.push(String.fromCharCode(65 + i)); // 65='A', 66='B', etc.
  }
  return levels;
}

// Retorna lista de andares da rua garantindo integridade
function getStreetLevels(street) {
  if (street && Array.isArray(street.levels) && street.levels.length > 0) {
    return street.levels;
  }
  return ['B', 'A'];
}

// Retorna quantidade de vagas por andar da rua
function getStreetSlotsPerLevel(street) {
  if (!street) return 8;
  if (street.slotsPerLevel && street.slotsPerLevel > 0) {
    return parseInt(street.slotsPerLevel, 10);
  }
  if (street.baysCount && street.baysCount > 0) {
    return parseInt(street.baysCount, 10) * 2;
  }
  return 8;
}

function renderAll() {
  renderKPIs();
  renderStreetTabs();
  renderCurrentStreetRack();
  updateStreetSelectOptions();
}

// Atualiza cartões de KPI
function renderKPIs() {
  let totalSlots = 0;
  let occupiedSlots = 0;
  let mixedPallets = 0;

  appState.streets.forEach(street => {
    const levels = getStreetLevels(street);
    const slotsPerLevel = getStreetSlotsPerLevel(street);
    totalSlots += (levels.length * slotsPerLevel);

    // Verificar ocupação das vagas existentes
    levels.forEach(level => {
      for (let s = 1; s <= slotsPerLevel; s++) {
        const code = `${level}${s}`;
        const slot = getSlot(street.id, code);
        if (slot.items && slot.items.length > 0) {
          occupiedSlots++;
          if (slot.items.length >= 2) {
            mixedPallets++;
          }
        }
      }
    });
  });

  const freeSlots = Math.max(0, totalSlots - occupiedSlots);

  document.getElementById('kpi-total-slots').textContent = totalSlots;
  document.getElementById('kpi-free-slots').textContent = freeSlots;
  document.getElementById('kpi-occupied-slots').textContent = occupiedSlots;
  document.getElementById('kpi-mixed-pallets').textContent = mixedPallets;
}

// Calcula estatísticas de ocupação e total de unidades para ordenação e relatórios
function getStreetOccupancyAndItemStats(streetId) {
  let occupiedSlots = 0;
  let totalItemsCount = 0;
  const street = appState.streets.find(s => s.id === streetId);
  if (!street) return { occupiedSlots: 0, totalItemsCount: 0, totalSlots: 0 };

  const levels = getStreetLevels(street);
  const slotsPerLevel = getStreetSlotsPerLevel(street);
  const totalSlots = levels.length * slotsPerLevel;

  levels.forEach(level => {
    for (let s = 1; s <= slotsPerLevel; s++) {
      const slot = getSlot(street.id, `${level}${s}`);
      if (slot.items && slot.items.length > 0) {
        occupiedSlots++;
        slot.items.forEach(it => {
          totalItemsCount += (Number(it.quantity) || 1);
        });
      }
    }
  });

  return { occupiedSlots, totalItemsCount, totalSlots };
}

// Retorna as ruas ordenadas conforme o critério selecionado pelo usuário
function getSortedStreets(sortOrder = appState.streetSortOrder || 'NUM_ASC') {
  const list = [...(appState.streets || [])];

  return list.sort((a, b) => {
    const numA = (a.name && a.name.match(/\d+/) ? parseInt(a.name.match(/\d+/)[0], 10) : 999999);
    const numB = (b.name && b.name.match(/\d+/) ? parseInt(b.name.match(/\d+/)[0], 10) : 999999);

    if (sortOrder === 'NUM_ASC') {
      if (numA !== numB) return numA - numB;
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortOrder === 'NUM_DESC') {
      if (numA !== numB) return numB - numA;
      return (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortOrder === 'ITEMS_DESC') {
      // Rua com mais materiais / itens primeiro
      const statsA = getStreetOccupancyAndItemStats(a.id);
      const statsB = getStreetOccupancyAndItemStats(b.id);
      if (statsB.totalItemsCount !== statsA.totalItemsCount) {
        return statsB.totalItemsCount - statsA.totalItemsCount;
      }
      if (statsB.occupiedSlots !== statsA.occupiedSlots) {
        return statsB.occupiedSlots - statsA.occupiedSlots;
      }
      return numA - numB;
    }
    if (sortOrder === 'ITEMS_ASC') {
      // Rua com menos materiais / vazias primeiro
      const statsA = getStreetOccupancyAndItemStats(a.id);
      const statsB = getStreetOccupancyAndItemStats(b.id);
      if (statsA.totalItemsCount !== statsB.totalItemsCount) {
        return statsA.totalItemsCount - statsB.totalItemsCount;
      }
      if (statsA.occupiedSlots !== statsB.occupiedSlots) {
        return statsA.occupiedSlots - statsB.occupiedSlots;
      }
      return numA - numB;
    }
    if (sortOrder === 'ALPHA_ASC') {
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    }
    return 0;
  });
}

// Renderiza as abas das ruas
function renderStreetTabs() {
  const container = document.getElementById('street-tabs-wrapper');
  if (!container) return;
  container.innerHTML = '';

  const sortSelect = document.getElementById('street-sort-select');
  if (sortSelect && sortSelect.value !== (appState.streetSortOrder || 'NUM_ASC')) {
    sortSelect.value = appState.streetSortOrder || 'NUM_ASC';
  }

  const sortedStreets = getSortedStreets(appState.streetSortOrder || 'NUM_ASC');

  sortedStreets.forEach(street => {
    const tab = document.createElement('button');
    tab.className = `street-tab ${street.id === appState.activeStreetId ? 'active' : ''}`;
    
    // Contagem de vagas ocupadas nessa rua
    const stats = getStreetOccupancyAndItemStats(street.id);

    tab.innerHTML = `
      <span>${escapeHtml(street.name)}</span>
      <span class="tab-badge">${stats.occupiedSlots}/${stats.totalSlots}</span>
    `;

    tab.addEventListener('click', () => {
      appState.activeStreetId = street.id;
      renderAll();
    });

    container.appendChild(tab);
  });
}

// Renderiza a estrutura da prateleira da rua selecionada
function renderCurrentStreetRack() {
  const currentStreet = appState.streets.find(s => s.id === appState.activeStreetId);
  if (!currentStreet) {
    if (appState.streets.length > 0) {
      appState.activeStreetId = appState.streets[0].id;
      return renderCurrentStreetRack();
    }
    return;
  }

  const levels = getStreetLevels(currentStreet);
  const slotsPerLevel = getStreetSlotsPerLevel(currentStreet);
  const totalSlotsInStreet = levels.length * slotsPerLevel;

  // Atualizar cabeçalho da rua
  document.getElementById('current-street-name').textContent = currentStreet.name;
  document.getElementById('current-street-stats').textContent = 
    `${totalSlotsInStreet} vagas • ${levels.length} andar(es) (${levels.slice().reverse().join(', ')}) • ${slotsPerLevel} vagas por andar`;

  const rackContainer = document.getElementById('rack-container');
  rackContainer.innerHTML = '';

  // Renderiza cada nível (C no alto, B no meio, A embaixo, etc.)
  levels.forEach((level, levelIdx) => {
    const levelRow = document.createElement('div');
    levelRow.className = 'rack-level-row';

    let levelLabel = `Andar ${level}`;
    if (levels.length === 1) {
      levelLabel += ' (Nível Único)';
    } else if (levelIdx === 0) {
      levelLabel += ' (Andar Superior)';
    } else if (levelIdx === levels.length - 1) {
      levelLabel += ' (Andar Inferior / Térreo)';
    } else {
      levelLabel += ' (Andar Intermediário)';
    }

    const levelHeader = document.createElement('div');
    levelHeader.className = 'level-header';
    levelHeader.innerHTML = `
      <span class="level-tag">${levelLabel}</span>
      <span class="level-desc">Vagas ${level}1 até ${level}${slotsPerLevel}</span>
    `;
    levelRow.appendChild(levelHeader);

    // Grade de vãos (módulos da prateleira com vagas em pares)
    const baysContainer = document.createElement('div');
    baysContainer.className = 'rack-bays-container';

    const totalBays = Math.ceil(slotsPerLevel / 2);
    for (let bay = 1; bay <= totalBays; bay++) {
      const bayElem = document.createElement('div');
      bayElem.className = 'rack-bay';

      // Etiqueta do Vão
      const bayLabel = document.createElement('div');
      bayLabel.className = 'bay-label';
      bayLabel.textContent = `Vão ${bay} (Módulo)`;
      bayElem.appendChild(bayLabel);

      // As vagas que cabem dentro deste vão
      const slotsPair = document.createElement('div');
      slotsPair.className = 'bay-slots-pair';

      const sNum1 = bay * 2 - 1;
      const sNum2 = bay * 2;

      if (sNum1 <= slotsPerLevel) {
        slotsPair.appendChild(createSlotCardElement(currentStreet.id, `${level}${sNum1}`));
      }
      if (sNum2 <= slotsPerLevel) {
        slotsPair.appendChild(createSlotCardElement(currentStreet.id, `${level}${sNum2}`));
      }

      bayElem.appendChild(slotsPair);
      baysContainer.appendChild(bayElem);
    }

    levelRow.appendChild(baysContainer);
    rackContainer.appendChild(levelRow);
  });
}

// Cria o componente visual de uma vaga individual
function createSlotCardElement(streetId, code) {
  const slot = getSlot(streetId, code);
  const items = slot.items || [];
  const itemCount = items.length;

  const card = document.createElement('div');
  card.id = `slot-card-${streetId}-${code}`;
  card.dataset.streetId = streetId;
  card.dataset.slotCode = code;

  let stateClass = 'slot-free';
  let tagClass = 'tag-free';
  let statusText = 'Vazia';

  if (itemCount === 1) {
    stateClass = 'slot-occupied';
    tagClass = 'tag-occupied';
    statusText = '1 Item';
  } else if (itemCount === 2) {
    stateClass = 'slot-mixed';
    tagClass = 'tag-mixed';
    statusText = 'Misto (2)';
  } else if (itemCount > 2) {
    stateClass = 'slot-mixed';
    tagClass = 'tag-mixed';
    statusText = `${itemCount} itens`;
  }

  card.className = `slot-card ${stateClass}`;

  // Cabeçalho da Vaga
  let html = `
    <div class="slot-top">
      <span class="slot-code">${code}</span>
      <span class="slot-status-tag ${tagClass}">${statusText}</span>
    </div>
  `;

  // Corpo com os produtos
  html += `<div class="slot-body">`;

  if (itemCount === 0) {
    html += `
      <div class="slot-empty-notice">
        <span>Pronta para</span>
        <span>armazenar</span>
      </div>
    `;
  } else if (itemCount <= 2) {
    items.forEach(item => {
      html += `
        <div class="slot-product-line" title="${escapeHtml(item.productName)}">
          <span class="product-name">${escapeHtml(item.productName)}</span>
          <div class="product-meta">
            <span class="meta-qty">${item.quantity} un</span>
            ${item.lot ? `<span class="meta-lot">Lt: ${escapeHtml(item.lot)}</span>` : ''}
          </div>
        </div>
      `;
    });

    if (itemCount === 2) {
      html += `
        <div class="slot-mixed-badge">
          📦 Palete Misto (2 Itens)
        </div>
      `;
    }
  } else {
    // Vagas com mais de 2 itens (ex: 3, 10, 20, 30+ itens) - exibição compacta sem estourar o card
    const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const firstItem = items[0];
    html += `
      <div class="slot-multi-summary" title="${escapeHtml(firstItem.productName)} e mais ${itemCount - 1} outros produtos...">
        <div class="slot-multi-badge">📦 ${itemCount} itens</div>
        <div class="slot-multi-units">Total: <strong>${totalUnits.toLocaleString('pt-BR')} un</strong></div>
        <div class="slot-multi-preview">• ${escapeHtml(firstItem.productName)}</div>
        <div class="slot-multi-more">+ ${itemCount - 1} outros produtos...</div>
      </div>
    `;
  }

  html += `</div>`;
  card.innerHTML = html;

  // Ao clicar, abre modal de detalhes da vaga
  card.addEventListener('click', () => {
    openSlotDetailsModal(streetId, code);
  });

  return card;
}

// Atualiza opções do dropdown de ruas nos modais
function updateStreetSelectOptions() {
  const streetSelect = document.getElementById('move-street');
  const historyStreetSelect = document.getElementById('filter-history-street');
  const sortedStreets = getSortedStreets('NUM_ASC');

  if (streetSelect) {
    const currentVal = streetSelect.value;
    streetSelect.innerHTML = '';
    sortedStreets.forEach(street => {
      const opt = document.createElement('option');
      opt.value = street.id;
      opt.textContent = street.name;
      streetSelect.appendChild(opt);
    });
    if (currentVal && sortedStreets.some(s => s.id === currentVal)) {
      streetSelect.value = currentVal;
    }
  }

  if (historyStreetSelect) {
    const currentVal = historyStreetSelect.value;
    historyStreetSelect.innerHTML = '<option value="ALL">Todas as Ruas</option>';
    sortedStreets.forEach(street => {
      const opt = document.createElement('option');
      opt.value = street.id;
      opt.textContent = street.name;
      historyStreetSelect.appendChild(opt);
    });
    historyStreetSelect.value = currentVal || 'ALL';
  }
}

// Atualiza opções de vagas no modal de movimentação conforme a rua escolhida
function updateSlotSelectOptions(streetId, selectedCode = null) {
  const slotSelect = document.getElementById('move-slot');
  if (!slotSelect) return;

  slotSelect.innerHTML = '';
  const street = appState.streets.find(s => s.id === streetId);
  if (!street) return;

  const levels = getStreetLevels(street);
  const slotsPerLevel = getStreetSlotsPerLevel(street);

  levels.forEach(level => {
    const optGroup = document.createElement('optgroup');
    optGroup.label = `Andar ${level}`;

    for (let s = 1; s <= slotsPerLevel; s++) {
      const code = `${level}${s}`;
      const slot = getSlot(streetId, code);
      const count = slot.items ? slot.items.length : 0;
      let suffix = '(Vazia)';
      if (count === 1) suffix = `(1 item: ${slot.items[0].productName.substring(0, 15)}...)`;
      if (count >= 2) suffix = `(⚠️ Misto: ${count} itens)`;

      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} ${suffix}`;
      if (selectedCode && code === selectedCode) {
        opt.selected = true;
      }
      optGroup.appendChild(opt);
    }

    slotSelect.appendChild(optGroup);
  });

  handleSlotChangeInForm();
}

// =============================================================================
// 3. FLUXO DO FORMULÁRIO DE MOVIMENTAÇÃO (VALIDAÇÕES & REGRAS)
// =============================================================================

// Fila de produtos em estágio para Entrada Multi-Itens
let stagedEntryItems = [];

function renderStagedEntryItems() {
  const container = document.getElementById('staged-items-container');
  const list = document.getElementById('staged-items-list');
  const countSpan = document.getElementById('staged-items-count');
  const totalSpan = document.getElementById('staged-items-total-units');
  const submitBtn = document.getElementById('btn-submit-movement');
  const productInput = document.getElementById('move-product-input');
  const qtyInput = document.getElementById('move-qty');

  if (!container || !list) return;

  if (stagedEntryItems.length === 0) {
    container.classList.add('hidden');
    list.innerHTML = '';
    if (productInput) productInput.setAttribute('required', 'true');
    if (qtyInput) qtyInput.setAttribute('required', 'true');
    if (submitBtn) {
      submitBtn.innerHTML = `<span>💾</span> Confirmar Registro`;
    }
    return;
  }

  // Com itens na fila de espera, os campos soltos não bloqueiam o envio
  if (productInput) productInput.removeAttribute('required');
  if (qtyInput) qtyInput.removeAttribute('required');

  container.classList.remove('hidden');
  if (countSpan) countSpan.textContent = stagedEntryItems.length;

  const totalUnits = stagedEntryItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  if (totalSpan) totalSpan.textContent = `${totalUnits.toLocaleString('pt-BR')} un`;

  if (submitBtn) {
    submitBtn.innerHTML = `<span>💾</span> Confirmar Entrada (${stagedEntryItems.length} ${stagedEntryItems.length === 1 ? 'item' : 'itens'})`;
  }

  list.innerHTML = '';
  stagedEntryItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'staged-item-row';
    row.innerHTML = `
      <div class="staged-item-main">
        <span class="staged-item-name" title="${escapeHtml(item.productName)}">${escapeHtml(item.productName)}</span>
        <div class="staged-item-meta">
          <strong class="staged-item-qty">${item.quantity.toLocaleString('pt-BR')} un</strong>
          ${item.lot ? `<span class="staged-item-lot">Lt: ${escapeHtml(item.lot)}</span>` : '<span class="text-dim" style="font-size: 0.7rem;">(Sem lote)</span>'}
        </div>
      </div>
      <button type="button" class="btn-remove-staged" data-index="${idx}" title="Remover item da fila">✕</button>
    `;

    row.querySelector('.btn-remove-staged').addEventListener('click', () => {
      removeStagedEntryItem(idx);
    });

    list.appendChild(row);
  });
}

function addCurrentItemToStaging() {
  hideMovementError();
  const productInput = document.getElementById('move-product-input');
  const qtyInput = document.getElementById('move-qty');
  const lotInput = document.getElementById('move-lot');

  const productName = (productInput?.value || '').trim();
  const quantity = parseInt(qtyInput?.value || '0', 10);
  const lot = (lotInput?.value || '').trim();

  if (!productName) {
    showMovementError('Por favor, informe o produto ou código para adicionar à lista.');
    productInput?.focus();
    return false;
  }

  if (isNaN(quantity) || quantity <= 0) {
    showMovementError('Por favor, informe uma quantidade válida maior que zero.');
    qtyInput?.focus();
    return false;
  }

  // Verifica se já está na fila com mesmo produto e lote
  const existingIdx = stagedEntryItems.findIndex(
    it => it.productName.toLowerCase() === productName.toLowerCase() && (it.lot || '') === lot
  );

  if (existingIdx >= 0) {
    stagedEntryItems[existingIdx].quantity += quantity;
  } else {
    stagedEntryItems.push({
      productName: productName,
      quantity: quantity,
      lot: lot
    });
  }

  // Limpa campos para o próximo item
  if (productInput) productInput.value = '';
  if (qtyInput) qtyInput.value = '';
  if (lotInput) lotInput.value = '';

  renderStagedEntryItems();
  updateCatalogHints();

  const suggestions = document.getElementById('product-suggestions');
  if (suggestions) suggestions.classList.add('hidden');

  // Retorna automaticamente o cursor para o campo de código
  setTimeout(() => {
    productInput?.focus();
  }, 50);

  return true;
}

function removeStagedEntryItem(index) {
  if (index >= 0 && index < stagedEntryItems.length) {
    stagedEntryItems.splice(index, 1);
    renderStagedEntryItems();
    document.getElementById('move-product-input')?.focus();
  }
}

function openMovementModal(options = {}) {
  const modal = document.getElementById('movement-modal');
  const form = document.getElementById('movement-form');
  form.reset();

  hideMovementError();
  document.getElementById('current-timestamp-preview').textContent = formatCurrentDateTime();

  // Resetar fila multi-itens
  stagedEntryItems = [];
  renderStagedEntryItems();

  // Selecionar Tipo
  const movementType = options.type || 'ENTRADA';
  const radio = form.querySelector(`input[name="movementType"][value="${movementType}"]`);
  if (radio) {
    radio.checked = true;
    updateTypeSelectorUI(movementType);
  }

  // Preencher ruas
  updateStreetSelectOptions();
  const streetId = options.streetId || appState.activeStreetId;
  document.getElementById('move-street').value = streetId;

  // Preencher vagas
  updateSlotSelectOptions(streetId, options.slotCode);

  // Se veio pré-definido produto ou lote
  if (options.productName) {
    document.getElementById('move-product-input').value = options.productName;
  }
  if (options.lot) {
    document.getElementById('move-lot').value = options.lot;
  }
  if (options.quantity) {
    document.getElementById('move-qty').value = options.quantity;
  }

  handleSlotChangeInForm();
  updateCatalogHints();
  const suggestionsBox = document.getElementById('product-suggestions');
  if (suggestionsBox) suggestionsBox.classList.add('hidden');

  modal.showModal();

  // Foco automático imediato no campo de código para Entrada
  if (movementType === 'ENTRADA') {
    setTimeout(() => {
      const input = document.getElementById('move-product-input');
      if (input) {
        input.focus();
        if (options.productName) {
          input.select();
        }
      }
    }, 100);
  }
}

// Atualiza o visual do seletor de tipo de movimentação
function updateTypeSelectorUI(type) {
  const labels = document.querySelectorAll('.movement-type-selector .type-btn');
  labels.forEach(l => l.classList.remove('selected'));

  const activeLabel = document.querySelector(`.movement-type-selector .type-${type === 'ENTRADA' ? 'in' : type === 'SAIDA' ? 'out' : 'fix'}`);
  if (activeLabel) activeLabel.classList.add('selected');

  const badge = document.getElementById('modal-type-badge');
  badge.textContent = type;
  if (type === 'ENTRADA') {
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = '#10b981';
    badge.style.borderColor = '#10b981';
  } else if (type === 'SAIDA') {
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#ef4444';
    badge.style.borderColor = '#ef4444';
  } else {
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#f59e0b';
    badge.style.borderColor = '#f59e0b';
  }

  // Ajustar labels e visibilidade de campos
  const productSelectGroup = document.getElementById('product-select-group');
  const productInputGroup = document.getElementById('product-input-group');
  const stageActionArea = document.getElementById('stage-item-action-area');
  const stagedContainer = document.getElementById('staged-items-container');
  const qtyHint = document.getElementById('qty-available-hint');
  const docReqMark = document.getElementById('doc-req-mark');

  if (type === 'SAIDA' || type === 'CORRECAO') {
    productSelectGroup.classList.remove('hidden');
    productInputGroup.classList.add('hidden');
    if (stageActionArea) stageActionArea.classList.add('hidden');
    if (stagedContainer) stagedContainer.classList.add('hidden');
    document.getElementById('move-product-input').removeAttribute('required');
    docReqMark.textContent = type === 'CORRECAO' ? '*(Obrigatório justificar)' : '*';
  } else {
    // ENTRADA
    productSelectGroup.classList.add('hidden');
    productInputGroup.classList.remove('hidden');
    if (stageActionArea) stageActionArea.classList.remove('hidden');
    if (stagedEntryItems && stagedEntryItems.length > 0) {
      if (stagedContainer) stagedContainer.classList.remove('hidden');
      document.getElementById('move-product-input').removeAttribute('required');
      document.getElementById('move-qty').removeAttribute('required');
    } else {
      document.getElementById('move-product-input').setAttribute('required', 'true');
      document.getElementById('move-qty').setAttribute('required', 'true');
    }
    docReqMark.textContent = '*';

    // Foco automático ao alternar para Entrada
    setTimeout(() => {
      const input = document.getElementById('move-product-input');
      if (input) input.focus();
    }, 60);
  }

  handleSlotChangeInForm();
}

// Atualiza informações contextuais da vaga selecionada no formulário
function handleSlotChangeInForm() {
  const streetId = document.getElementById('move-street').value;
  const slotCode = document.getElementById('move-slot').value;
  const type = document.querySelector('input[name="movementType"]:checked')?.value || 'ENTRADA';
  const statusBox = document.getElementById('slot-live-status-box');
  const productSelect = document.getElementById('move-product-select');
  const qtyHint = document.getElementById('qty-available-hint');

  hideMovementError();

  if (!streetId || !slotCode) {
    statusBox.classList.add('hidden');
    return;
  }

  const slot = getSlot(streetId, slotCode);
  const items = slot.items || [];

  // Atualizar caixa de status ao vivo
  statusBox.classList.remove('hidden');
  let statusHtml = `<strong>Status da Vaga ${slotCode}:</strong> `;
  if (items.length === 0) {
    statusHtml += `<span style="color: #10b981;">Vazia (Livre para armazenar)</span>`;
  } else if (items.length === 1) {
    statusHtml += `<span style="color: #38bdf8;">Ocupada (1 produto: ${escapeHtml(items[0].productName)} - ${items[0].quantity} un)</span>`;
  } else {
    statusHtml += `<span style="color: #f59e0b;">📦 Palete Misto (${items.length} produtos armazenados)</span>`;
  }

  // Informação de palete com múltiplos itens para entrada
  if (type === 'ENTRADA' && items.length >= 2) {
    statusHtml += `<div style="color: #f59e0b; font-weight: 600; margin-top: 4px;">
      📦 Palete Misto: Esta vaga já contém ${items.length} itens armazenados. Novos produtos serão adicionados ao palete.
    </div>`;
  }

  statusBox.innerHTML = statusHtml;

  // Atualizar select de produtos para Saída ou Correção
  if (type === 'SAIDA' || type === 'CORRECAO') {
    productSelect.innerHTML = '<option value="">Selecione o produto...</option>';
    if (items.length === 0) {
      productSelect.innerHTML = '<option value="">(Vaga vazia - sem itens)</option>';
      qtyHint.textContent = '(Saldo: 0)';
    } else {
      items.forEach((item, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `${item.productName} | Lote: ${item.lot || 'S/L'} | Saldo: ${item.quantity} un`;
        productSelect.appendChild(opt);
      });
      // Seleciona o primeiro por padrão
      productSelect.selectedIndex = 1;
      updateQtyHintForSelectedProduct();
    }
  } else {
    qtyHint.textContent = '';
  }
}

// Atualiza dica de saldo disponível ao mudar o produto selecionado
function updateQtyHintForSelectedProduct() {
  const streetId = document.getElementById('move-street').value;
  const slotCode = document.getElementById('move-slot').value;
  const productSelect = document.getElementById('move-product-select');
  const qtyHint = document.getElementById('qty-available-hint');
  const type = document.querySelector('input[name="movementType"]:checked')?.value;

  if (productSelect.value === '' || !streetId || !slotCode) {
    qtyHint.textContent = '';
    return;
  }

  const slot = getSlot(streetId, slotCode);
  const itemIndex = parseInt(productSelect.value, 10);
  const item = slot.items[itemIndex];

  if (item) {
    if (type === 'SAIDA') {
      qtyHint.textContent = `(Saldo disponível: ${item.quantity} un)`;
      document.getElementById('move-qty').max = item.quantity;
      // Preencher lote automaticamente
      if (item.lot) document.getElementById('move-lot').value = item.lot;
    } else if (type === 'CORRECAO') {
      qtyHint.textContent = `(Saldo atual: ${item.quantity} un)`;
      document.getElementById('move-qty').value = item.quantity;
      if (item.lot) document.getElementById('move-lot').value = item.lot;
    }
  }
}

function showMovementError(message) {
  const banner = document.getElementById('movement-error-banner');
  const text = document.getElementById('movement-error-text');
  text.textContent = message;
  banner.classList.remove('hidden');
}

function hideMovementError() {
  const banner = document.getElementById('movement-error-banner');
  banner.classList.add('hidden');
}

// Execução e submissão da movimentação
function handleMovementSubmit(e) {
  e.preventDefault();
  hideMovementError();

  const form = document.getElementById('movement-form');
  const type = form.querySelector('input[name="movementType"]:checked').value;
  const streetId = document.getElementById('move-street').value;
  const slotCode = document.getElementById('move-slot').value;
  const doc = document.getElementById('move-doc').value.trim();
  const timestamp = formatCurrentDateTime();

  const street = appState.streets.find(s => s.id === streetId);
  const streetName = street ? street.name : streetId;
  const slot = getSlot(streetId, slotCode);
  const items = slot.items || [];

  if (!doc) {
    showMovementError('Informe o número da Solicitação, NF ou motivo para auditoria.');
    return;
  }

  // ---------------- ENTRADA ----------------
  if (type === 'ENTRADA') {
    const currentInputVal = document.getElementById('move-product-input').value.trim();
    const currentQtyVal = parseInt(document.getElementById('move-qty').value, 10);
    const currentLotVal = document.getElementById('move-lot').value.trim();

    // Se o operador tem um item digitado no momento do clique, tenta enfileirar automaticamente
    if (currentInputVal && !isNaN(currentQtyVal) && currentQtyVal > 0) {
      addCurrentItemToStaging();
    }

    // Se ainda assim a fila estiver vazia, valida o item único dos campos
    if (stagedEntryItems.length === 0) {
      if (!currentInputVal) {
        showMovementError('Por favor, informe o nome ou código do produto.');
        document.getElementById('move-product-input')?.focus();
        return;
      }
      if (isNaN(currentQtyVal) || currentQtyVal <= 0) {
        showMovementError('Por favor, informe uma quantidade válida maior que zero.');
        document.getElementById('move-qty')?.focus();
        return;
      }
      stagedEntryItems.push({
        productName: currentInputVal,
        quantity: currentQtyVal,
        lot: currentLotVal
      });
    }

    // Registrar todos os itens enfileirados no palete
    const itemsToProcess = [...stagedEntryItems];
    const isBatch = itemsToProcess.length > 1;

    itemsToProcess.forEach((stagedItem, idx) => {
      // Se mesmo produto e mesmo lote: Apenas incrementa saldo
      const existingIndex = items.findIndex(
        it => it.productName.toLowerCase() === stagedItem.productName.toLowerCase() && (it.lot || '') === stagedItem.lot
      );

      if (existingIndex >= 0) {
        items[existingIndex].quantity += stagedItem.quantity;
      } else {
        // Novo item no palete (sem limite de quantidade de produtos!)
        items.push({
          productName: stagedItem.productName,
          quantity: stagedItem.quantity,
          lot: stagedItem.lot
        });
      }

      // Registrar histórico
      const movRecord = {
        id: 'mov_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: timestamp,
        type: 'ENTRADA',
        streetId: streetId,
        streetName: streetName,
        slotCode: slotCode,
        productName: stagedItem.productName,
        quantity: stagedItem.quantity,
        lot: stagedItem.lot,
        docNumber: doc,
        notes: isBatch ? `Entrada em lote (${itemsToProcess.length} itens)` : 'Entrada registrada'
      };

      appState.movements.unshift(movRecord);

      if (window.SupabaseService && SupabaseService.isConnected) {
        SupabaseService.insertMovement(movRecord);
      }
    });

    // Limpar fila
    stagedEntryItems = [];
    renderStagedEntryItems();

  // ---------------- SAÍDA ----------------
  } else if (type === 'SAIDA') {
    const quantity = parseInt(document.getElementById('move-qty').value, 10);
    const lot = document.getElementById('move-lot').value.trim();

    if (isNaN(quantity) || quantity <= 0) {
      showMovementError('Por favor, informe uma quantidade válida maior que zero.');
      return;
    }

    const select = document.getElementById('move-product-select');
    if (select.value === '') {
      showMovementError('Selecione o produto que deseja dar baixa.');
      return;
    }

    const itemIndex = parseInt(select.value, 10);
    const targetItem = items[itemIndex];

    if (!targetItem) {
      showMovementError('O produto selecionado não foi encontrado na vaga.');
      return;
    }

    // TRAVA DE SEGURANÇA: Não permitir saída maior que o saldo do palete!
    if (quantity > targetItem.quantity) {
      showMovementError(
        `Erro de Saldo: Você tentou dar baixa de ${quantity} un, mas o palete na vaga ${slotCode} contém apenas ${targetItem.quantity} un de "${targetItem.productName}".`
      );
      return;
    }

    const productName = targetItem.productName;
    const itemLot = targetItem.lot;

    // Abater quantidade
    targetItem.quantity -= quantity;

    // Se zerou, remove do palete
    if (targetItem.quantity === 0) {
      items.splice(itemIndex, 1);
    }

    // Registrar histórico
    const movRecord = {
      id: 'mov_' + Date.now(),
      timestamp: timestamp,
      type: 'SAIDA',
      streetId: streetId,
      streetName: streetName,
      slotCode: slotCode,
      productName: productName,
      quantity: quantity,
      lot: itemLot,
      docNumber: doc,
      notes: 'Saída/Baixa registrada'
    };
    appState.movements.unshift(movRecord);

    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.insertMovement(movRecord);
    }

  // ---------------- CORREÇÃO ----------------
  } else if (type === 'CORRECAO') {
    const quantity = parseInt(document.getElementById('move-qty').value, 10);
    const lot = document.getElementById('move-lot').value.trim();

    if (isNaN(quantity) || quantity < 0) {
      showMovementError('Por favor, informe uma quantidade válida (0 ou superior).');
      return;
    }

    const select = document.getElementById('move-product-select');
    if (select.value === '') {
      showMovementError('Selecione o produto da vaga que necessita de correção.');
      return;
    }

    const itemIndex = parseInt(select.value, 10);
    const targetItem = items[itemIndex];

    if (!targetItem) {
      showMovementError('O produto selecionado não foi encontrado na vaga.');
      return;
    }

    const oldQty = targetItem.quantity;
    targetItem.quantity = quantity;
    if (lot) targetItem.lot = lot;

    // Se a correção colocou zero, remover
    if (targetItem.quantity === 0) {
      items.splice(itemIndex, 1);
    }

    // Registrar histórico de correção com auditoria
    const movRecord = {
      id: 'mov_' + Date.now(),
      timestamp: timestamp,
      type: 'CORRECAO',
      streetId: streetId,
      streetName: streetName,
      slotCode: slotCode,
      productName: targetItem.productName,
      quantity: quantity,
      lot: targetItem.lot,
      docNumber: doc,
      notes: `Ajuste de saldo: de ${oldQty} para ${quantity} un.`
    };
    appState.movements.unshift(movRecord);

    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.insertMovement(movRecord);
    }
  }

  // Salva no LocalStorage e atualiza tela
  saveState();
  renderAll();

  // Sincroniza com Supabase se estiver conectado
  if (window.SupabaseService && SupabaseService.isConnected) {
    SupabaseService.upsertSlot(streetId, slotCode, items);
  }

  // Fechar modal
  document.getElementById('movement-modal').close();

  // Se o modal de detalhes da vaga estiver aberto, atualizar ele também
  const detailsModal = document.getElementById('slot-details-modal');
  if (detailsModal.open) {
    openSlotDetailsModal(streetId, slotCode);
  }
}

// =============================================================================
// 4. MODAL DE DETALHES DA VAGA
// =============================================================================

function openSlotDetailsModal(streetId, code) {
  const modal = document.getElementById('slot-details-modal');
  const street = appState.streets.find(s => s.id === streetId);
  const streetName = street ? street.name : streetId;
  const slot = getSlot(streetId, code);
  const items = slot.items || [];

  document.getElementById('slot-detail-address').textContent = `${streetName.toUpperCase()} - VAGA ${code}`;
  document.getElementById('slot-detail-title').textContent = `Posição ${code}`;

  // Card de status do palete
  const statusCard = document.getElementById('slot-detail-status-card');
  if (items.length === 0) {
    statusCard.innerHTML = `
      <div>
        <h4 style="color: #10b981;">🟢 Posição Vazia</h4>
        <p class="text-muted" style="font-size: 0.85rem;">Pronta para receber um novo palete.</p>
      </div>
      <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 0.3rem 0.6rem; border-radius: 4px; font-weight: 700;">LIVRE</span>
    `;
  } else if (items.length === 1) {
    statusCard.innerHTML = `
      <div>
        <h4 style="color: #38bdf8;">🔵 Palete com 1 Produto</h4>
        <p class="text-muted" style="font-size: 0.85rem;">Armazenamento padrão recomendado.</p>
      </div>
      <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #38bdf8; padding: 0.3rem 0.6rem; border-radius: 4px; font-weight: 700;">PADRÃO</span>
    `;
  } else {
    statusCard.innerHTML = `
      <div>
        <h4 style="color: #f59e0b;">🟠 Palete Misto (${items.length} Produtos)</h4>
        <p class="text-muted" style="font-size: 0.85rem;">${items.length} materiais diferentes compartilhando este espaço.</p>
      </div>
      <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 0.3rem 0.6rem; border-radius: 4px; font-weight: 700;">MISTO</span>
    `;
  }

  // Lista de produtos
  const itemsList = document.getElementById('slot-items-list');
  itemsList.innerHTML = '';
  document.getElementById('slot-items-count-badge').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

  if (items.length === 0) {
    itemsList.innerHTML = `<p class="text-muted" style="text-align: center; padding: 1rem;">Nenhum produto cadastrado nesta posição.</p>`;
  } else {
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'slot-item-detail-card';
      card.innerHTML = `
        <div class="item-main-info">
          <span class="item-name">${escapeHtml(item.productName)}</span>
          <span class="item-lot-badge">Lote: <strong>${escapeHtml(item.lot || 'Sem lote')}</strong></span>
        </div>
        <div class="item-qty-badge">${item.quantity} <span style="font-size: 0.75rem; color: #94a3b8;">un</span></div>
      `;
      itemsList.appendChild(card);
    });
  }

  // Ações rápidas na vaga
  document.getElementById('btn-slot-quick-in').onclick = () => {
    openMovementModal({ type: 'ENTRADA', streetId: streetId, slotCode: code });
  };

  document.getElementById('btn-slot-quick-out').onclick = () => {
    if (items.length === 0) {
      alert('Esta vaga está vazia. Não há produtos para dar baixa.');
      return;
    }
    openMovementModal({ type: 'SAIDA', streetId: streetId, slotCode: code });
  };

  document.getElementById('btn-slot-quick-fix').onclick = () => {
    if (items.length === 0) {
      alert('Esta vaga está vazia. Use "Dar Entrada" para cadastrar um produto.');
      return;
    }
    openMovementModal({ type: 'CORRECAO', streetId: streetId, slotCode: code });
  };

  // Histórico específico desta vaga
  const historyList = document.getElementById('slot-history-list');
  historyList.innerHTML = '';
  const slotMovements = appState.movements.filter(m => m.streetId === streetId && m.slotCode === code);

  if (slotMovements.length === 0) {
    historyList.innerHTML = `<p class="text-muted" style="font-size: 0.8rem; text-align: center; padding: 0.5rem;">Nenhuma movimentação registrada nesta vaga.</p>`;
  } else {
    slotMovements.slice(0, 5).forEach(m => {
      const item = document.createElement('div');
      item.className = 'history-mini-item';
      let typeColor = m.type === 'ENTRADA' ? '#10b981' : m.type === 'SAIDA' ? '#ef4444' : '#f59e0b';
      item.innerHTML = `
        <div>
          <strong style="color: ${typeColor};">${m.type}</strong>: ${escapeHtml(m.productName)} (${m.quantity} un)
          <div class="text-muted" style="font-size: 0.7rem;">${m.docNumber ? `Doc: ${escapeHtml(m.docNumber)} • ` : ''}${m.timestamp}</div>
        </div>
      `;
      historyList.appendChild(item);
    });
  }

  modal.showModal();
}

// =============================================================================
// 5. HISTÓRICO GERAL DE AUDITORIA & EXPORTAÇÃO CSV
// =============================================================================

function openHistoryModal() {
  const modal = document.getElementById('history-modal');
  updateStreetSelectOptions();
  renderHistoryTable();
  modal.showModal();
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  const filterText = document.getElementById('filter-history-text').value.toLowerCase();
  const filterType = document.getElementById('filter-history-type').value;
  const filterStreet = document.getElementById('filter-history-street').value;

  tbody.innerHTML = '';

  const filtered = appState.movements.filter(m => {
    // Filtro por tipo
    if (filterType !== 'ALL' && m.type !== filterType) return false;
    // Filtro por rua
    if (filterStreet !== 'ALL' && m.streetId !== filterStreet) return false;
    // Filtro por texto
    if (filterText) {
      const searchContent = `${m.productName} ${m.lot || ''} ${m.docNumber || ''} ${m.slotCode} ${m.streetName} ${m.notes || ''}`.toLowerCase();
      if (!searchContent.includes(filterText)) return false;
    }
    return true;
  });

  document.getElementById('history-record-count').textContent = `Total: ${filtered.length} registro(s)`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhuma movimentação encontrada com os filtros aplicados.</td></tr>`;
    return;
  }

  filtered.forEach(m => {
    const tr = document.createElement('tr');
    let pillClass = m.type === 'ENTRADA' ? 'pill-in' : m.type === 'SAIDA' ? 'pill-out' : 'pill-fix';

    tr.innerHTML = `
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">${m.timestamp}</td>
      <td><span class="type-pill ${pillClass}">${m.type}</span></td>
      <td><strong>${escapeHtml(m.streetName)}</strong> - <span style="color: #38bdf8; font-weight: 700;">${m.slotCode}</span></td>
      <td><strong>${escapeHtml(m.productName)}</strong></td>
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">${m.quantity}</td>
      <td>${m.lot ? `<span class="meta-lot">${escapeHtml(m.lot)}</span>` : '<span class="text-muted">-</span>'}</td>
      <td>
        <div>${escapeHtml(m.docNumber || '-')}</div>
        ${m.notes ? `<small class="text-muted">${escapeHtml(m.notes)}</small>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function exportHistoryToCSV() {
  if (!appState.movements || appState.movements.length === 0) {
    alert('Não há movimentações para exportar.');
    return;
  }

  const headers = ['Data e Hora', 'Tipo', 'Rua', 'Vaga', 'Produto', 'Quantidade', 'Lote', 'Solicitacao / NF', 'Observacoes'];
  const rows = appState.movements.map(m => [
    `"${m.timestamp}"`,
    `"${m.type}"`,
    `"${m.streetName || m.streetId}"`,
    `"${m.slotCode}"`,
    `"${(m.productName || '').replace(/"/g, '""')}"`,
    m.quantity,
    `"${(m.lot || '').replace(/"/g, '""')}"`,
    `"${(m.docNumber || '').replace(/"/g, '""')}"`,
    `"${(m.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico_almoxarifado_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =============================================================================
// 6. BUSCA GLOBAL DE PRODUTOS, LOTES E ENDEREÇOS
// =============================================================================

function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('clear-search-btn');
  const panel = document.getElementById('search-results-panel');
  const list = document.getElementById('search-results-list');
  const countLabel = document.getElementById('search-count-label');
  const closeBtn = document.getElementById('close-search-panel-btn');

  function doSearch() {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      clearBtn.classList.add('hidden');
      panel.classList.add('hidden');
      return;
    }

    clearBtn.classList.remove('hidden');
    panel.classList.remove('hidden');
    list.innerHTML = '';

    const results = [];

    // Busca nas vagas
    appState.streets.forEach(street => {
      const levels = getStreetLevels(street);
      const slotsPerLevel = getStreetSlotsPerLevel(street);

      levels.forEach(level => {
        for (let s = 1; s <= slotsPerLevel; s++) {
          const code = `${level}${s}`;
          const slot = getSlot(street.id, code);
          const matchesCode = code.toLowerCase().includes(query);

          (slot.items || []).forEach(item => {
            const matchesName = item.productName.toLowerCase().includes(query);
            const matchesLot = (item.lot || '').toLowerCase().includes(query);

            if (matchesName || matchesLot || matchesCode) {
              results.push({
                streetId: street.id,
                streetName: street.name,
                slotCode: code,
                item: item
              });
            }
          });

          // Se buscou diretamente pelo código de uma vaga vazia
          if (matchesCode && (!slot.items || slot.items.length === 0)) {
            results.push({
              streetId: street.id,
              streetName: street.name,
              slotCode: code,
              item: null
            });
          }
        }
      });
    });

    // Busca também no catálogo de produtos cadastrados
    if (appState.catalog && appState.catalog.length > 0) {
      appState.catalog.forEach(cat => {
        const matchesCode = cat.code.toLowerCase().includes(query);
        const matchesDesc = cat.description.toLowerCase().includes(query);

        if (matchesCode || matchesDesc) {
          // Verifica se esse item já está alocado em algum slot dos resultados
          const alreadyInResults = results.some(r => r.item && (
            r.item.productName.toLowerCase().includes(cat.code.toLowerCase()) ||
            r.item.productName.toLowerCase().includes(cat.description.toLowerCase())
          ));

          if (!alreadyInResults) {
            results.push({
              isCatalogItem: true,
              catItem: cat
            });
          }
        }
      });
    }

    countLabel.textContent = `${results.length} resultado(s) para "${query}"`;

    if (results.length === 0) {
      list.innerHTML = `<p class="text-muted" style="grid-column: 1 / -1; padding: 0.5rem;">Nenhum produto ou vaga correspondente.</p>`;
      return;
    }

    results.forEach(res => {
      const itemCard = document.createElement('div');
      itemCard.className = 'search-result-item';

      if (res.isCatalogItem) {
        itemCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <strong style="color: #f59e0b;">📚 Catálogo (Sem estoque alocado)</strong>
            <span class="autocomplete-code">${escapeHtml(res.catItem.code)}</span>
          </div>
          <div style="font-weight: 600; color: #fff; margin-top: 2px;">${escapeHtml(res.catItem.description)}</div>
          <div style="font-size: 0.75rem; color: #38bdf8; margin-top: 4px;">➕ Clique para dar entrada deste produto</div>
        `;

        itemCard.addEventListener('click', () => {
          panel.classList.add('hidden');
          openMovementModal({
            type: 'ENTRADA',
            productName: `[${res.catItem.code}] ${res.catItem.description}`
          });
        });
      } else if (res.item) {
        itemCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <strong style="color: #38bdf8;">${res.streetName} • Vaga ${res.slotCode}</strong>
            <span style="font-family: monospace; font-weight: 700; color: #10b981;">${res.item.quantity} un</span>
          </div>
          <div style="font-weight: 600; color: #fff; margin-top: 2px;">${escapeHtml(res.item.productName)}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">${res.item.lot ? `Lote: ${escapeHtml(res.item.lot)}` : 'Sem lote'}</div>
        `;

        itemCard.addEventListener('click', () => {
          panel.classList.add('hidden');
          jumpToSlot(res.streetId, res.slotCode);
        });
      } else {
        itemCard.innerHTML = `
          <div>
            <strong style="color: #38bdf8;">${res.streetName} • Vaga ${res.slotCode}</strong>
            <div style="font-size: 0.75rem; color: #10b981;">Vaga Vazia (Livre)</div>
          </div>
        `;

        itemCard.addEventListener('click', () => {
          panel.classList.add('hidden');
          jumpToSlot(res.streetId, res.slotCode);
        });
      }

      list.appendChild(itemCard);
    });
  }

  input.addEventListener('input', doSearch);

  clearBtn.addEventListener('click', () => {
    input.value = '';
    doSearch();
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
  });
}

// Pula para a rua e destaca visualmente a vaga no mapa
function jumpToSlot(streetId, slotCode) {
  appState.activeStreetId = streetId;
  renderAll();

  setTimeout(() => {
    const card = document.getElementById(`slot-card-${streetId}-${slotCode}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      card.classList.add('highlighted');
      setTimeout(() => {
        card.classList.remove('highlighted');
      }, 3500);
    }
  }, 100);
}

// =============================================================================
// 7. GERENCIAMENTO DE RUAS & CONFIGURAÇÃO DE VAGAS
// =============================================================================

let editingStreetId = null;
let isCreatingNewStreet = false;

function openManageStreetModal(streetId, isNew = false) {
  const modal = document.getElementById('manage-street-modal');
  const modalTitle = document.getElementById('manage-street-modal-title');
  const nameInput = document.getElementById('edit-street-name-input');
  const levelsInput = document.getElementById('edit-levels-count-input');
  const slotsInput = document.getElementById('edit-slots-per-level-input');
  const dangerZone = document.getElementById('manage-street-danger-zone');
  const saveBtn = document.getElementById('btn-save-street-config');

  isCreatingNewStreet = isNew;
  editingStreetId = streetId;

  if (isNew) {
    if (modalTitle) modalTitle.textContent = '➕ Cadastrar Nova Rua';
    if (nameInput) nameInput.value = `Rua ${appState.streets.length + 1}`;
    if (levelsInput) levelsInput.value = '2';
    if (slotsInput) slotsInput.value = '8';
    if (dangerZone) dangerZone.classList.add('hidden');
    if (saveBtn) saveBtn.textContent = '➕ Criar Rua';
  } else {
    const street = appState.streets.find(s => s.id === streetId);
    if (!street) return;

    const levels = getStreetLevels(street);
    const slotsPerLevel = getStreetSlotsPerLevel(street);

    if (modalTitle) modalTitle.textContent = `📐 Configurar ${street.name}`;
    if (nameInput) nameInput.value = street.name;
    if (levelsInput) levelsInput.value = levels.length;
    if (slotsInput) slotsInput.value = slotsPerLevel;
    if (dangerZone) dangerZone.classList.remove('hidden');
    if (saveBtn) saveBtn.textContent = '💾 Salvar Alterações';
  }

  updateStreetModalSummary();
  modal.showModal();
  setTimeout(() => (isNew ? nameInput?.focus() : slotsInput?.focus()), 150);
}

function updateStreetModalSummary() {
  const levelsInput = document.getElementById('edit-levels-count-input');
  const slotsInput = document.getElementById('edit-slots-per-level-input');
  const levelsPreview = document.getElementById('edit-levels-preview');
  const slotsPreview = document.getElementById('edit-slots-preview');
  const totalSlotsEl = document.getElementById('preview-total-slots');
  const lettersDescEl = document.getElementById('preview-letters-desc');

  const levelsCount = Math.max(1, Math.min(15, parseInt(levelsInput?.value, 10) || 1));
  const slotsCount = Math.max(1, Math.min(100, parseInt(slotsInput?.value, 10) || 1));
  const levelsList = generateLevelsList(levelsCount);
  const total = levelsCount * slotsCount;

  if (levelsPreview) {
    levelsPreview.textContent = `Andares: ${levelsList.slice().reverse().join(', ')} (${levelsCount} andar${levelsCount > 1 ? 'es' : ''})`;
  }
  if (slotsPreview) {
    slotsPreview.textContent = `Vagas de 1 até ${slotsCount} em cada andar`;
  }
  if (totalSlotsEl) {
    totalSlotsEl.textContent = `${total} vaga${total > 1 ? 's' : ''}`;
  }
  if (lettersDescEl) {
    const topLevel = levelsList[0];
    const bottomLevel = levelsList[levelsList.length - 1];
    lettersDescEl.innerHTML = `Andares: <strong>${levelsList.join(', ')}</strong> • Vagas: <strong>${bottomLevel}1 a ${bottomLevel}${slotsCount} ... ${topLevel}1 a ${topLevel}${slotsCount}</strong>`;
  }
}

function setupStreetManagementEvents() {
  // Seletor de Ordenação / Filtro das Ruas
  const sortSelect = document.getElementById('street-sort-select');
  if (sortSelect) {
    sortSelect.value = appState.streetSortOrder || 'NUM_ASC';
    sortSelect.addEventListener('change', (e) => {
      appState.streetSortOrder = e.target.value;
      saveState();
      renderStreetTabs();
    });
  }

  // Botão Nova Rua
  document.getElementById('btn-add-street').addEventListener('click', () => {
    openManageStreetModal(null, true);
  });

  // Botão Editar Rua Atual
  document.getElementById('btn-edit-street').addEventListener('click', () => {
    openManageStreetModal(appState.activeStreetId, false);
  });

  // Atualização em tempo real ao digitar nos campos
  const levelsInput = document.getElementById('edit-levels-count-input');
  const slotsInput = document.getElementById('edit-slots-per-level-input');
  if (levelsInput) levelsInput.addEventListener('input', updateStreetModalSummary);
  if (slotsInput) slotsInput.addEventListener('input', updateStreetModalSummary);

  // Salvar Configuração da Rua (Nova ou Edição)
  document.getElementById('btn-save-street-config').addEventListener('click', () => {
    const nameInput = document.getElementById('edit-street-name-input');
    const streetName = (nameInput ? nameInput.value : '').trim();
    if (!streetName) {
      alert('Por favor, informe um nome para a Rua.');
      nameInput?.focus();
      return;
    }

    const levelsCount = Math.max(1, Math.min(15, parseInt(levelsInput?.value, 10) || 2));
    const slotsPerLevel = Math.max(1, Math.min(100, parseInt(slotsInput?.value, 10) || 8));
    const levels = generateLevelsList(levelsCount);
    const baysCount = Math.ceil(slotsPerLevel / 2);

    if (isCreatingNewStreet) {
      const newStreetId = 'street_' + Date.now();
      const newStreet = {
        id: newStreetId,
        name: streetName,
        levels: levels,
        slotsPerLevel: slotsPerLevel,
        baysCount: baysCount
      };

      appState.streets.push(newStreet);
      appState.activeStreetId = newStreetId;
      saveState();
      renderAll();
      updateStreetSelectOptions();

      if (window.SupabaseService && SupabaseService.isConnected) {
        SupabaseService.upsertStreet(newStreet);
      }
    } else {
      const street = appState.streets.find(s => s.id === editingStreetId);
      if (!street) return;

      street.name = streetName;
      street.levels = levels;
      street.slotsPerLevel = slotsPerLevel;
      street.baysCount = baysCount;

      saveState();
      renderAll();
      updateStreetSelectOptions();

      if (window.SupabaseService && SupabaseService.isConnected) {
        SupabaseService.upsertStreet(street);
      }
    }

    document.getElementById('manage-street-modal').close();
  });

  // Excluir Rua
  document.getElementById('btn-delete-street').addEventListener('click', () => {
    if (appState.streets.length <= 1) {
      alert('O sistema precisa ter pelo menos 1 rua cadastrada.');
      return;
    }

    const street = appState.streets.find(s => s.id === editingStreetId);
    if (!street) return;

    const confirmDelete = confirm(`Tem certeza que deseja excluir a "${street.name}" e todas as suas vagas?`);
    if (!confirmDelete) return;

    // Remover slots da rua
    Object.keys(appState.slots).forEach(key => {
      if (key.startsWith(`${editingStreetId}_`)) {
        delete appState.slots[key];
      }
    });

    // Remover rua
    appState.streets = appState.streets.filter(s => s.id !== editingStreetId);
    appState.activeStreetId = appState.streets[0].id;

    saveState();
    renderAll();
    updateStreetSelectOptions();

    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.deleteStreet(editingStreetId);
    }

    document.getElementById('manage-street-modal').close();
  });
}

// =============================================================================
// 8. BACKUP, RESTAURAÇÃO & CONFIGURAÇÕES
// =============================================================================

function setupSettingsAndBackup() {
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').showModal();
  });

  // Download do Backup em JSON
  document.getElementById('btn-download-backup').addEventListener('click', () => {
    const dataStr = JSON.stringify(appState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_almoxarifado_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Importação do Backup
  const fileInput = document.getElementById('backup-file-input');
  document.getElementById('btn-trigger-import').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported.streets || !Array.isArray(imported.streets)) {
          throw new Error('Arquivo de backup inválido: lista de ruas não encontrada.');
        }

        if (confirm('Restaurar este backup substituirá os dados atuais do almoxarifado. Deseja continuar?')) {
          appState = imported;
          saveState();
          renderAll();
          alert('Backup restaurado com sucesso!');
          document.getElementById('settings-modal').close();
        }
      } catch (err) {
        alert('Falha ao restaurar backup: ' + err.message);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  // Reset para Dados Demo
  document.getElementById('btn-reset-demo').addEventListener('click', () => {
    if (confirm('Restaurar dados de exemplo? As alterações não salvas serão substituídas.')) {
      appState = JSON.parse(JSON.stringify(DEFAULT_INITIAL_STATE));
      saveState();
      renderAll();
      document.getElementById('settings-modal').close();
      alert('Dados de exemplo restaurados!');
    }
  });

  // Limpar Tudo (com verificação de senha mestre de segurança)
  const clearAllBtn = document.getElementById('btn-clear-all');
  const securityModal = document.getElementById('security-password-modal');
  const securityForm = document.getElementById('security-password-form');
  const securityInput = document.getElementById('security-password-input');
  const securityFeedback = document.getElementById('security-password-feedback');
  const securityFeedbackText = document.getElementById('security-password-feedback-text');
  const toggleSecurityPwd = document.getElementById('btn-toggle-security-pwd');
  const cancelSecurityBtn = document.getElementById('btn-cancel-security-action');
  const closeSecurityBtn = document.getElementById('btn-close-security-modal');
  const confirmDeleteBtn = document.getElementById('btn-confirm-delete-all');

  const MASTER_DELETE_PASS = '126f9a80@Eco';

  if (clearAllBtn && securityModal) {
    clearAllBtn.addEventListener('click', () => {
      if (securityInput) securityInput.value = '';
      if (securityFeedback) securityFeedback.classList.add('hidden');
      if (confirmDeleteBtn) {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = '🗑️ Confirmar e Limpar Tudo';
      }
      securityModal.showModal();
      setTimeout(() => securityInput?.focus(), 150);
    });
  }

  if (toggleSecurityPwd && securityInput) {
    toggleSecurityPwd.addEventListener('click', () => {
      const isPwd = securityInput.type === 'password';
      securityInput.type = isPwd ? 'text' : 'password';
      toggleSecurityPwd.textContent = isPwd ? '🙈' : '👁️';
    });
  }

  if (closeSecurityBtn && securityModal) {
    closeSecurityBtn.addEventListener('click', () => securityModal.close());
  }

  if (cancelSecurityBtn && securityModal) {
    cancelSecurityBtn.addEventListener('click', () => securityModal.close());
  }

  if (securityForm) {
    securityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const entered = (securityInput ? securityInput.value : '');

      if (entered === MASTER_DELETE_PASS) {
        if (securityFeedback) securityFeedback.classList.add('hidden');
        if (confirmDeleteBtn) {
          confirmDeleteBtn.disabled = true;
          confirmDeleteBtn.textContent = 'Apagando dados...';
        }

        try {
          // 1. Limpa dados locais (LocalStorage e memória)
          appState.slots = {};
          appState.movements = [];
          appState.catalog = [];
          saveState();
          renderAll();
          renderCatalogTable();
          updateCatalogHints();

          // 2. Limpa dados no Supabase se conectado
          if (window.SupabaseService && SupabaseService.isConnected) {
            await SupabaseService.clearAllData();
          }

          securityModal.close();
          const settingsModal = document.getElementById('settings-modal');
          if (settingsModal && settingsModal.open) settingsModal.close();

          alert('Sucesso! Todo o estoque, histórico e catálogo foram completamente apagados (no dispositivo e na nuvem).');
        } catch (err) {
          console.error('Erro ao limpar dados na nuvem:', err);
          alert('Os dados locais foram limpos, mas houve um erro ao limpar na nuvem: ' + err.message);
          securityModal.close();
        }
      } else {
        if (securityFeedback && securityFeedbackText) {
          securityFeedbackText.textContent = 'Senha incorreta! Operação cancelada.';
          securityFeedback.classList.remove('hidden');
        }
        const card = securityModal.querySelector('.dialog-card');
        if (card) {
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 450);
        }
        if (securityInput) {
          securityInput.value = '';
          securityInput.focus();
        }
      }
    });
  }
}

// =============================================================================
// 8.5. CATÁLOGO BASE DE PRODUTOS (IMPORTAÇÃO & AUTOCOMPLETE)
// =============================================================================

function setupCatalogManager() {
  const btnCatalog = document.getElementById('btn-catalog');
  const btnImportExcel = document.getElementById('btn-import-excel');
  const directFileInput = document.getElementById('direct-excel-file-input');
  const catalogModal = document.getElementById('catalog-modal');
  const btnCloseModal = document.getElementById('btn-close-catalog-modal');
  const btnCloseFooter = document.getElementById('btn-close-catalog-footer');
  const btnProcessPaste = document.getElementById('btn-process-paste');
  const pasteInput = document.getElementById('paste-excel-input');
  const csvFileInput = document.getElementById('catalog-csv-file');
  const dropzone = document.getElementById('catalog-dropzone');
  const filterInput = document.getElementById('filter-catalog-input');
  const btnClearCatalog = document.getElementById('btn-clear-catalog');

  // Botão direto do topo: "Importar Planilha" (abre o seletor de arquivos na hora)
  if (btnImportExcel && directFileInput) {
    btnImportExcel.addEventListener('click', () => {
      directFileInput.click();
    });

    directFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleExcelOrCsvFile(file);
        directFileInput.value = '';
      }
    });
  }

  // Botão do topo: "Catálogo" (abre a janela do catálogo)
  if (btnCatalog) {
    btnCatalog.addEventListener('click', () => {
      renderCatalogTable();
      catalogModal.showModal();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', () => catalogModal.close());
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', () => catalogModal.close());

  // Processar texto colado do Excel
  if (btnProcessPaste) {
    btnProcessPaste.addEventListener('click', () => {
      const text = pasteInput.value.trim();
      if (!text) {
        alert('Por favor, cole as colunas A e B do Excel na caixa de texto.');
        return;
      }
      const count = parseAndImportCatalogText(text);
      pasteInput.value = '';
      renderCatalogTable();
      updateCatalogHints();
      alert(`Sucesso! ${count} produtos foram processados e adicionados ao catálogo.`);
    });
  }

  // Upload pela área de soltar/clicar no modal
  if (dropzone && csvFileInput) {
    dropzone.addEventListener('click', () => csvFileInput.click());

    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleExcelOrCsvFile(file);
        csvFileInput.value = '';
      }
    });

    // Suporte para arrastar e soltar (Drag and Drop)
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) {
        handleExcelOrCsvFile(file);
      }
    });
  }

  // Filtro na tabela de catálogo
  if (filterInput) {
    filterInput.addEventListener('input', renderCatalogTable);
  }

  // Limpar todo o catálogo
  if (btnClearCatalog) {
    btnClearCatalog.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja apagar todos os produtos do catálogo base?')) {
        appState.catalog = [];
        saveState();
        if (window.SupabaseService && SupabaseService.isConnected) {
          SupabaseService.clearCatalog();
        }
        renderCatalogTable();
        updateCatalogHints();
      }
    });
  }
}

// Limpa texto de célula removendo aspas, apóstrofos do Excel, BOM (\uFEFF) e espaços não separáveis (\u00A0)
function extractCleanCellValue(val) {
  if (val === undefined || val === null) return '';
  let str = String(val);
  // Remove BOM, NBSP, aspas normais, aspas curvas e apóstrofos no início e fim
  str = str.replace(/^[\s\uFEFF\u00A0'"´`]+|[\s\uFEFF\u00A0'"´`]+$/g, '').trim();
  return str;
}

// Processa arquivo selecionado (suporta .xlsx, .xls, .csv e .txt)
function handleExcelOrCsvFile(file) {
  const fileName = file.name.toLowerCase();
  const catalogModal = document.getElementById('catalog-modal');

  // Se a biblioteca XLSX estiver carregada, lemos .xlsx, .xls e também .csv com alta precisão
  if (typeof XLSX !== 'undefined') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellText: true,
          cellDates: true
        });

        // Procura a melhor aba (com maior número de linhas de dados válidos)
        let bestRows = [];
        let bestSheetName = workbook.SheetNames[0] || 'Planilha';

        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          if (!ws || !ws['!ref']) continue;
          // raw: false faz o SheetJS formatar todos os valores para texto (.w), preservando zeros à esquerda e strings alfanuméricas tipo "ES0000000000574"
          const rows = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: '',
            raw: false,
            blankrows: false
          });
          if (rows && rows.length > bestRows.length) {
            bestRows = rows;
            bestSheetName = sheetName;
          }
        }

        if (bestRows.length === 0) {
          // Fallback com raw: true caso as células não tenham formato pré-definido
          for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            if (!ws || !ws['!ref']) continue;
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
            if (rows && rows.length > bestRows.length) {
              bestRows = rows;
              bestSheetName = sheetName;
            }
          }
        }

        if (bestRows.length === 0) {
          alert(`A planilha "${file.name}" parece não conter linhas legíveis.`);
          return;
        }

        const count = importFrom2DArray(bestRows);
        renderCatalogTable();
        updateCatalogHints();
        if (!catalogModal.open) catalogModal.showModal();
        alert(`Planilha "${file.name}" (Aba: "${bestSheetName}") importada com sucesso!\n${count} produtos foram cadastrados/atualizados no catálogo.`);
      } catch (err) {
        console.warn('Erro ao processar com XLSX, tentando fallback CSV:', err);
        fallbackReadTextFile(file);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // Fallback caso XLSX não esteja disponível
  fallbackReadTextFile(file);
}

function fallbackReadTextFile(file) {
  const catalogModal = document.getElementById('catalog-modal');
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const count = parseAndImportCatalogText(text);
    renderCatalogTable();
    updateCatalogHints();
    if (!catalogModal.open) catalogModal.showModal();
    alert(`Arquivo "${file.name}" importado com sucesso!\n${count} produtos carregados no catálogo.`);
  };
  reader.readAsText(file, 'UTF-8');
}

// Importa matriz 2D vinda do Excel com detecção inteligente de cabeçalhos e alta performance O(1)
function importFrom2DArray(rows) {
  if (!appState.catalog) appState.catalog = [];
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  // Mapa O(1) para inserção ultra rápida sem travar o navegador
  const catalogMap = new Map();
  (appState.catalog || []).forEach(it => {
    if (it && it.code) catalogMap.set(String(it.code).trim().toLowerCase(), { code: String(it.code).trim(), description: String(it.description || it.code).trim() });
  });

  let colCode = -1;
  let colDesc = -1;
  let headerRowIndex = -1;

  // 1. Tenta identificar linha de cabeçalho nos primeiros 15 registros
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const c0 = extractCleanCellValue(row[0]).toLowerCase();
    const c1 = extractCleanCellValue(row[1]).toLowerCase();

    // Caso exato da PLANILHA BASE: Coluna 0 = "Produto", Coluna 1 = "Descricao"
    if ((c0 === 'produto' || c0 === 'código' || c0 === 'codigo' || c0.startsWith('cod') || c0.startsWith('cód') || c0 === 'sku' || c0 === 'material' || c0 === 'item') &&
        (c1 === 'descricao' || c1 === 'descrição' || c1.startsWith('desc') || c1.startsWith('denom') || c1 === 'nome' || c1 === 'especificacao' || c1 === 'texto breve')) {
      colCode = 0;
      colDesc = 1;
      headerRowIndex = r;
      break;
    }

    // Busca dinâmica em qualquer coluna
    let candidateCode = -1;
    let candidateDesc = -1;

    for (let c = 0; c < row.length; c++) {
      const cellText = extractCleanCellValue(row[c]).toLowerCase();
      if (!cellText) continue;

      const isCodeHeader = (
        cellText === 'código' || cellText === 'codigo' || cellText === 'cód' || cellText === 'cód.' ||
        cellText === 'cod' || cellText === 'cod.' || cellText === 'sku' || cellText === 'item' ||
        cellText === 'material' || cellText === 'ref' || cellText === 'referência' || cellText === 'referencia' ||
        cellText === 'part number' || cellText === 'partnumber' || cellText === 'código material' ||
        cellText === 'codigo material' || cellText === 'coluna a' || cellText.startsWith('cód') || cellText.startsWith('cod')
      );

      const isDescHeader = (
        cellText === 'descrição' || cellText === 'descricao' || cellText === 'desc' || cellText === 'desc.' ||
        cellText === 'nome' || cellText === 'denominação' || cellText === 'denominacao' ||
        cellText === 'texto breve' || cellText === 'especificação' || cellText === 'especificacao' ||
        cellText === 'detalhes' || cellText === 'coluna b' || cellText.startsWith('desc') || cellText.startsWith('denom')
      );

      if (candidateCode === -1 && isCodeHeader && !isDescHeader) {
        candidateCode = c;
      } else if (candidateDesc === -1 && isDescHeader && !isCodeHeader) {
        candidateDesc = c;
      }
    }

    if (candidateCode !== -1 && candidateDesc !== -1) {
      colCode = candidateCode;
      colDesc = candidateDesc;
      headerRowIndex = r;
      break;
    }
  }

  let importedCount = 0;
  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

  for (let index = startRow; index < rows.length; index++) {
    const row = rows[index];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let code = '';
    let desc = '';

    if (colCode !== -1 && colDesc !== -1) {
      code = extractCleanCellValue(row[colCode]);
      desc = extractCleanCellValue(row[colDesc]);
    } else {
      const cleanCells = [];
      for (let c = 0; c < row.length; c++) {
        const val = extractCleanCellValue(row[c]);
        if (val) cleanCells.push({ colIndex: c, text: val });
      }

      if (cleanCells.length === 0) continue;

      if (cleanCells.length === 1) {
        const singleVal = cleanCells[0].text;
        const sepMatch = singleVal.match(/^([A-Za-z0-9_\-\.]+)\s*[-:–|\t;]\s*(.+)$/);
        if (sepMatch) {
          code = sepMatch[1].trim();
          desc = sepMatch[2].trim();
        } else {
          code = singleVal;
          desc = singleVal;
        }
      } else if (cleanCells.length >= 2) {
        if (/^\d{1,4}$/.test(cleanCells[0].text) && cleanCells.length >= 3 && cleanCells[1].text.length >= 2) {
          code = cleanCells[1].text;
          desc = cleanCells.slice(2).map(c => c.text).join(' - ');
        } else {
          code = cleanCells[0].text;
          desc = cleanCells.slice(1).map(c => c.text).join(' - ');
        }
      }
    }

    code = extractCleanCellValue(code);
    desc = extractCleanCellValue(desc);

    if (!code && !desc) continue;
    if (!code && desc) code = desc;
    if (!desc && code) desc = code;

    const lowerCode = code.toLowerCase();
    const lowerDesc = desc.toLowerCase();
    if ((lowerCode === 'código' || lowerCode === 'codigo' || lowerCode === 'cod' || lowerCode === 'produto' || lowerCode === 'coluna a') &&
        (lowerDesc === 'descrição' || lowerDesc === 'descricao' || lowerDesc === 'desc' || lowerDesc === 'coluna b')) {
      continue;
    }

    // Atualização instantânea O(1) no Map
    if (catalogMap.has(lowerCode)) {
      catalogMap.get(lowerCode).description = desc;
    } else {
      catalogMap.set(lowerCode, { code: code, description: desc });
    }

    importedCount++;
  }

  // Converte Map de volta para Array
  appState.catalog = Array.from(catalogMap.values());

  saveState();
  if (window.SupabaseService && SupabaseService.isConnected) {
    // Sincroniza em segundo plano sem travar
    setTimeout(() => {
      SupabaseService.bulkUpsertCatalog(appState.catalog);
    }, 100);
  }
  return importedCount;
}

// Analisador de linha CSV respeitando aspas e delimitadores
function parseCsvLine(text, delimiter) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      if (inQuotes && text[i + 1] === c) {
        cur += c;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// Analisa e importa texto vindo do Excel (tab-separated) ou CSV (; ou ,)
function parseAndImportCatalogText(rawText) {
  if (!rawText || !rawText.trim()) return 0;
  const lines = rawText.split(/\r?\n/);
  const rows = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parts = [];
    if (trimmed.includes('\t')) {
      parts = trimmed.split('\t');
    } else if (trimmed.includes(';')) {
      parts = parseCsvLine(trimmed, ';');
    } else if (trimmed.includes('|')) {
      parts = trimmed.split('|').map(s => s.trim()).filter(s => s !== '');
    } else if (trimmed.includes(',')) {
      parts = parseCsvLine(trimmed, ',');
    } else {
      // Se não há separador formal, tenta múltiplos espaços
      if (/\s{2,}/.test(trimmed)) {
        parts = trimmed.split(/\s{2,}/);
      } else {
        // Tenta separar pelo primeiro espaço
        const firstSpace = trimmed.indexOf(' ');
        if (firstSpace > 0) {
          parts = [trimmed.substring(0, firstSpace), trimmed.substring(firstSpace + 1)];
        } else {
          parts = [trimmed, trimmed];
        }
      }
    }
    rows.push(parts);
  });

  return importFrom2DArray(rows);
}

// Renderiza a tabela do modal de catálogo (com exibição otimizada para suportar 20.000+ produtos)
function renderCatalogTable() {
  const tbody = document.getElementById('catalog-table-body');
  const filter = (document.getElementById('filter-catalog-input')?.value || '').toLowerCase().trim();
  const counter = document.getElementById('catalog-total-counter');

  if (!tbody) return;
  tbody.innerHTML = '';

  const catalog = appState.catalog || [];
  let filtered = [];

  if (!filter) {
    filtered = catalog.slice(0, 100);
    if (counter) {
      counter.textContent = catalog.length > 100
        ? `Exibindo primeiros 100 de ${catalog.length} produtos (digite para filtrar)`
        : `${catalog.length} produtos`;
    }
  } else {
    // Filtro instantâneo otimizado
    for (let i = 0; i < catalog.length; i++) {
      const it = catalog[i];
      if (!it || !it.code) continue;
      const c = it.code.toLowerCase();
      const d = (it.description || '').toLowerCase();
      if (c.includes(filter) || d.includes(filter)) {
        filtered.push(it);
        if (filtered.length >= 200) break;
      }
    }
    if (counter) {
      counter.textContent = `${filtered.length >= 200 ? '200+' : filtered.length} produto(s) encontrado(s) de ${catalog.length}`;
    }
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 2rem;">Nenhum produto correspondente a "${escapeHtml(filter)}".</td></tr>`;
    return;
  }

  filtered.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="autocomplete-code">${escapeHtml(item.code)}</span></td>
      <td><strong>${escapeHtml(item.description)}</strong></td>
      <td style="text-align: center;">
        <button type="button" class="btn-close-sm" title="Excluir item do catálogo">✕</button>
      </td>
    `;

    tr.querySelector('button').addEventListener('click', () => {
      removeCatalogItem(item.code);
    });

    tbody.appendChild(tr);
  });
}

function removeCatalogItem(code) {
  if (!appState.catalog) return;
  appState.catalog = appState.catalog.filter(i => i.code !== code);
  saveState();
  if (window.SupabaseService && SupabaseService.isConnected) {
    SupabaseService.deleteCatalogItem(code);
  }
  renderCatalogTable();
  updateCatalogHints();
}

function updateCatalogHints() {
  const countHint = document.getElementById('catalog-count-hint');
  if (countHint) {
    const total = (appState.catalog || []).length;
    countHint.textContent = total > 0 
      ? `💡 ${total} produtos no catálogo (digite código ou nome)`
      : `💡 Digite o produto livremente`;
  }
}

// Configura o Autocomplete em tempo real no campo de produto da movimentação
function setupProductAutocomplete() {
  const input = document.getElementById('move-product-input');
  const dropdown = document.getElementById('product-suggestions');
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function renderSuggestions(matches) {
    dropdown.innerHTML = '';
    activeIndex = -1;

    if (matches.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    matches.slice(0, 10).forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'autocomplete-item';
      row.dataset.index = idx;
      row.innerHTML = `
        <span class="autocomplete-code">${escapeHtml(item.code)}</span>
        <span class="autocomplete-desc">${escapeHtml(item.description)}</span>
      `;

      row.addEventListener('click', () => {
        selectSuggestion(item);
      });

      dropdown.appendChild(row);
    });

    dropdown.classList.remove('hidden');
  }

  function selectSuggestion(item) {
    // Preenche com o código e descrição formatados
    input.value = `[${item.code}] ${item.description}`;
    dropdown.classList.add('hidden');
    // Foca na quantidade
    document.getElementById('move-qty')?.focus();
  }

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q || !appState.catalog || appState.catalog.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    // Busca rápida com saída em 15 resultados
    const matches = [];
    const catalog = appState.catalog;
    for (let i = 0; i < catalog.length; i++) {
      const item = catalog[i];
      if (!item || !item.code) continue;
      const c = item.code.toLowerCase();
      const d = (item.description || '').toLowerCase();
      if (c.includes(q) || d.includes(q)) {
        matches.push(item);
        if (matches.length >= 15) break;
      }
    }

    renderSuggestions(matches);
  });

  // Ao sair do campo (ou leitor de código de barras): se digitou apenas o código exato, expande automaticamente
  input.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.classList.add('hidden');
      const val = input.value.trim();
      if (!val || val.startsWith('[')) return;
      const exact = (appState.catalog || []).find(it => it.code.toLowerCase() === val.toLowerCase());
      if (exact) {
        input.value = `[${exact.code}] ${exact.description}`;
      }
    }, 250);
  });

  // Navegação por teclado (Cima, Baixo, Enter, Esc)
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (dropdown.classList.contains('hidden') || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        items[activeIndex].click();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  function updateActiveItem(items) {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Fechar dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

// =============================================================================
// 8.8. SINCRONIZAÇÃO COM SUPABASE (NUVEM & TEMPO REAL)
// =============================================================================

function updateCloudBadgeUI(isOnline) {
  const badge = document.getElementById('cloud-status-badge');
  const text = document.getElementById('cloud-status-text');
  const btnSync = document.getElementById('btn-sync-to-cloud');
  const statusDetail = document.getElementById('supabase-status-detail');

  if (!badge || !text) return;

  if (isOnline) {
    badge.className = 'cloud-badge cloud-online';
    text.textContent = '🟢 Nuvem Conectada';
    if (statusDetail) statusDetail.textContent = 'Conectado (Tempo Real Ativo)';
    if (btnSync) btnSync.disabled = false;
  } else {
    badge.className = 'cloud-badge cloud-local';
    text.textContent = '🟡 Modo Local';
    if (statusDetail) statusDetail.textContent = 'Desconectado (Modo Local)';
    if (btnSync) btnSync.disabled = true;
  }
}

async function initSupabaseIntegration() {
  const badge = document.getElementById('cloud-status-badge');
  const btnCloudConfig = document.getElementById('btn-cloud-config');
  const modal = document.getElementById('supabase-modal');
  const btnCloseModal = document.getElementById('btn-close-supabase-modal');
  const btnCloseFooter = document.getElementById('btn-close-supabase-footer');

  const urlInput = document.getElementById('supabase-url-input');
  const keyInput = document.getElementById('supabase-key-input');
  const btnTest = document.getElementById('btn-test-supabase');
  const btnSave = document.getElementById('btn-save-supabase');
  const btnSync = document.getElementById('btn-sync-to-cloud');
  const btnDisconnect = document.getElementById('btn-disconnect-supabase');
  const feedbackBanner = document.getElementById('supabase-connection-feedback');
  const feedbackText = document.getElementById('supabase-feedback-text');

  function showFeedback(msg, isError) {
    if (!feedbackBanner || !feedbackText) return;
    feedbackText.textContent = msg;
    feedbackBanner.className = `alert-banner ${isError ? 'alert-danger' : 'alert-success'}`;
    feedbackBanner.classList.remove('hidden');
  }

  function hideFeedback() {
    if (feedbackBanner) feedbackBanner.classList.add('hidden');
  }

  // Preencher inputs com configuração salva
  function populateInputs() {
    if (!window.SupabaseService) return;
    const cfg = SupabaseService.getConfig();
    if (urlInput) urlInput.value = cfg.url || '';
    if (keyInput) keyInput.value = cfg.anonKey || '';
    hideFeedback();
  }

  // Abrir modal de configuração
  if (badge) {
    badge.addEventListener('click', () => {
      populateInputs();
      modal.showModal();
    });
  }

  if (btnCloudConfig) {
    btnCloudConfig.addEventListener('click', () => {
      populateInputs();
      modal.showModal();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', () => modal.close());
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', () => modal.close());

  // Testar Conexão
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      if (!url || !key) {
        showFeedback('Preencha a URL e a Chave anon para testar.', true);
        return;
      }
      btnTest.disabled = true;
      btnTest.textContent = 'Testando...';
      try {
        await SupabaseService.testConnection(url, key);
        showFeedback('Conexão realizada com sucesso com o banco Supabase!', false);
      } catch (err) {
        showFeedback('Falha na conexão: ' + err.message, true);
      } finally {
        btnTest.disabled = false;
        btnTest.textContent = '🧪 Testar Conexão';
      }
    });
  }

  // Salvar e Conectar
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      if (!url || !key) {
        showFeedback('Preencha a URL e a Chave anon.', true);
        return;
      }

      btnSave.disabled = true;
      btnSave.textContent = 'Conectando...';

      try {
        await SupabaseService.testConnection(url, key);
        SupabaseService.saveConfig(url, key);
        SupabaseService.init();

        showFeedback('Conectado! Baixando dados da nuvem...', false);

        // Baixar dados remotos do Supabase
        const remoteData = await SupabaseService.fetchAllData();
        if (remoteData) {
          if (remoteData.streets && remoteData.streets.length > 0) {
            appState.streets = remoteData.streets;
          }
          if (remoteData.slots !== undefined && remoteData.slots !== null) {
            appState.slots = remoteData.slots;
          }
          if (remoteData.movements !== undefined && remoteData.movements !== null) {
            appState.movements = remoteData.movements;
          }
          if (remoteData.catalog && Array.isArray(remoteData.catalog) && remoteData.catalog.length > 0) {
            if (!appState.catalog || appState.catalog.length === 0) {
              appState.catalog = remoteData.catalog;
            } else {
              const map = new Map();
              appState.catalog.forEach(it => map.set(it.code.toLowerCase(), it));
              remoteData.catalog.forEach(it => {
                if (!map.has(it.code.toLowerCase())) {
                  map.set(it.code.toLowerCase(), it);
                }
              });
              appState.catalog = Array.from(map.values());
            }
          }
          saveState();
          renderAll();
          renderCatalogTable();
          updateCatalogHints();
        }

        // Inscrever no Realtime WebSockets
        SupabaseService.subscribeRealtime(handleRealtimeEvent);
        updateCloudBadgeUI(true);

        setTimeout(() => {
          modal.close();
          alert('Pronto! O sistema agora está conectado ao Supabase na nuvem em tempo real!');
        }, 800);
      } catch (err) {
        showFeedback('Erro: ' + err.message, true);
        updateCloudBadgeUI(false);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = '💾 Salvar e Conectar';
      }
    });
  }

  // Sincronizar dados locais para a nuvem
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      if (!confirm('Deseja enviar todo o estoque e catálogo locais para o Supabase agora?')) return;
      btnSync.disabled = true;
      btnSync.textContent = 'Enviando...';
      try {
        await SupabaseService.syncLocalToRemote(appState);
        alert('Todos os dados locais foram enviados para a nuvem com sucesso!');
      } catch (err) {
        alert('Erro ao enviar dados para o Supabase: ' + err.message);
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = '☁️ Enviar Estoque Local para o Supabase';
      }
    });
  }

  // Desconectar da Nuvem
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      if (confirm('Deseja desconectar do Supabase e voltar a usar o modo local offline?')) {
        SupabaseService.clearConfig();
        updateCloudBadgeUI(false);
        modal.close();
        alert('Desconectado. O sistema agora está operando no Modo Local.');
      }
    });
  }

  // Inicialização automática ao carregar
  if (window.SupabaseService && SupabaseService.isConfigured()) {
    const initialized = SupabaseService.init();
    if (initialized) {
      updateCloudBadgeUI(true);
      // Busca dados remotos em segundo plano
      SupabaseService.fetchAllData().then(remoteData => {
        if (remoteData) {
          if (remoteData.streets && remoteData.streets.length > 0) appState.streets = remoteData.streets;
          if (remoteData.slots !== undefined && remoteData.slots !== null) appState.slots = remoteData.slots;
          if (remoteData.movements !== undefined && remoteData.movements !== null) appState.movements = remoteData.movements;
          if (remoteData.catalog && Array.isArray(remoteData.catalog) && remoteData.catalog.length > 0) {
            if (!appState.catalog || appState.catalog.length === 0) {
              appState.catalog = remoteData.catalog;
            } else {
              const map = new Map();
              appState.catalog.forEach(it => map.set(it.code.toLowerCase(), it));
              remoteData.catalog.forEach(it => {
                if (!map.has(it.code.toLowerCase())) {
                  map.set(it.code.toLowerCase(), it);
                }
              });
              appState.catalog = Array.from(map.values());
            }
          }
          saveState();
          renderAll();
          renderCatalogTable();
          updateCatalogHints();
        }
      }).catch(err => {
        console.warn('Não foi possível sincronizar imediatamente com Supabase (offline?):', err);
      });

      // Assina WebSockets
      SupabaseService.subscribeRealtime(handleRealtimeEvent);
    } else {
      updateCloudBadgeUI(false);
    }
  } else {
    updateCloudBadgeUI(false);
  }
}

// Manipula eventos recebidos em tempo real via WebSockets de outro dispositivo
function handleRealtimeEvent(table, payload) {
  console.log(`[Realtime Supabase] Alteração detectada na tabela ${table}:`, payload);

  if (table === 'slots') {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new;
      appState.slots[row.id] = {
        streetId: row.street_id,
        code: row.code,
        items: row.items || []
      };
    } else if (payload.eventType === 'DELETE') {
      delete appState.slots[payload.old.id];
    }
    saveState();
    renderAll();
  } else if (table === 'streets') {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new;
      const idx = appState.streets.findIndex(s => s.id === row.id);
      const slotsPerLevel = row.bays_count || 8;
      const streetObj = {
        id: row.id,
        name: row.name,
        slotsPerLevel: slotsPerLevel,
        baysCount: Math.ceil(slotsPerLevel / 2),
        levels: row.levels || ['B', 'A']
      };
      if (idx >= 0) appState.streets[idx] = streetObj;
      else appState.streets.push(streetObj);
    } else if (payload.eventType === 'DELETE') {
      appState.streets = appState.streets.filter(s => s.id !== payload.old.id);
    }
    saveState();
    renderAll();
  } else if (table === 'movements') {
    if (payload.eventType === 'INSERT') {
      const row = payload.new;
      if (!appState.movements.some(m => m.id === row.id)) {
        appState.movements.unshift({
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
        });
        saveState();
        if (document.getElementById('history-modal').open) {
          renderHistoryTable();
        }
      }
    }
  } else if (table === 'catalog') {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new;
      const idx = appState.catalog.findIndex(c => c.code === row.code);
      if (idx >= 0) appState.catalog[idx].description = row.description;
      else appState.catalog.push({ code: row.code, description: row.description });
    } else if (payload.eventType === 'DELETE') {
      appState.catalog = appState.catalog.filter(c => c.code !== payload.old.code);
    }
    saveState();
    renderCatalogTable();
    updateCatalogHints();
  }
}

// =============================================================================
// 9. ESCAPE HTML & INICIALIZAÇÃO
// =============================================================================

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// 10. CONTROLE DE ACESSO & AUTENTICAÇÃO
// =============================================================================

const AUTH_STORAGE_KEY = 'almoxarifado_auth_session_v1';
const ALLOWED_USER = 'brunohof';
const ALLOWED_PASS = '126f9a80@LU';

function initAuth() {
  const overlay = document.getElementById('auth-overlay');
  const form = document.getElementById('auth-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const rememberCheckbox = document.getElementById('auth-remember-me');
  const errorBanner = document.getElementById('auth-error-banner');
  const togglePwdBtn = document.getElementById('btn-toggle-password');
  const logoutBtn = document.getElementById('btn-logout');
  const displayNameEl = document.getElementById('user-display-name');
  const card = overlay ? overlay.querySelector('.auth-card') : null;

  function isAuthenticated() {
    try {
      const persistent = localStorage.getItem(AUTH_STORAGE_KEY);
      const session = sessionStorage.getItem(AUTH_STORAGE_KEY);
      return Boolean(persistent || session);
    } catch (e) {
      return false;
    }
  }

  function setAuthenticatedUI(isAuth) {
    if (!overlay) return;
    if (isAuth) {
      overlay.classList.add('hidden');
      if (displayNameEl) displayNameEl.textContent = 'Brunohof';
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (errorBanner) errorBanner.classList.add('hidden');
    } else {
      overlay.classList.remove('hidden');
      if (usernameInput) {
        usernameInput.value = 'Brunohof';
        if (passwordInput) {
          passwordInput.value = '';
          setTimeout(() => passwordInput.focus(), 150);
        }
      }
    }
  }

  // Verifica sessão existente ao iniciar
  if (isAuthenticated()) {
    setAuthenticatedUI(true);
  } else {
    setAuthenticatedUI(false);
  }

  // Alternar visibilidade da senha
  if (togglePwdBtn && passwordInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePwdBtn.textContent = isPassword ? '🙈' : '👁️';
      togglePwdBtn.title = isPassword ? 'Ocultar senha' : 'Ver senha';
    });
  }

  // Submissão do formulário de login
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredUser = (usernameInput ? usernameInput.value : '').trim().toLowerCase();
      const enteredPass = passwordInput ? passwordInput.value : '';

      if (enteredUser === ALLOWED_USER && enteredPass === ALLOWED_PASS) {
        if (errorBanner) errorBanner.classList.add('hidden');
        const sessionPayload = JSON.stringify({
          user: 'Brunohof',
          authenticatedAt: new Date().toISOString()
        });

        if (rememberCheckbox && rememberCheckbox.checked) {
          localStorage.setItem(AUTH_STORAGE_KEY, sessionPayload);
        } else {
          sessionStorage.setItem(AUTH_STORAGE_KEY, sessionPayload);
        }

        setAuthenticatedUI(true);
      } else {
        if (errorBanner) errorBanner.classList.remove('hidden');
        if (card) {
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 450);
        }
        if (passwordInput) {
          passwordInput.value = '';
          passwordInput.focus();
        }
      }
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Deseja realmente sair do sistema de almoxarifado?')) {
        try {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
        } catch (e) {
          console.warn('Erro ao remover sessão:', e);
        }
        setAuthenticatedUI(false);
      }
    });
  }
}

// =============================================================================
// FUNÇÃO UTILITÁRIA DE EXTRAÇÃO DE CÓDIGO E DESCRIÇÃO
// =============================================================================

function extractProductCodeAndDesc(rawName) {
  let name = (rawName || '').trim();
  if (!name) return { code: '', desc: '' };

  // Formato padrão com colchetes: [ES0000000000574] Descrição do Produto
  const bracketMatch = name.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    const code = bracketMatch[1].trim();
    const desc = bracketMatch[2].trim() || code;
    return { code, desc };
  }

  // Tenta localizar no catálogo pelo código exato
  if (appState.catalog && appState.catalog.length > 0) {
    const byCode = appState.catalog.find(it => it && it.code && it.code.toLowerCase() === name.toLowerCase());
    if (byCode) {
      return { code: byCode.code, desc: byCode.description || byCode.code };
    }

    // Tenta localizar no catálogo pela descrição
    const byDesc = appState.catalog.find(it => it && it.description && it.description.toLowerCase() === name.toLowerCase());
    if (byDesc) {
      return { code: byDesc.code, desc: byDesc.description };
    }
  }

  // Se tem hífen como separador (ex: "ES0000000000574 - Descrição")
  const dashMatch = name.match(/^([A-Za-z0-9_-]+)\s*-\s*(.+)$/);
  if (dashMatch) {
    return { code: dashMatch[1].trim(), desc: dashMatch[2].trim() };
  }

  return { code: name, desc: name };
}

// =============================================================================
// RELATÓRIO DE ESTOQUE GERAL & EXPORTAÇÃO EXCEL
// =============================================================================

function getAllStockItems() {
  const list = [];
  appState.streets.forEach(street => {
    const streetId = street.id;
    const streetName = street.name;
    const levels = street.levels || ['B', 'A'];
    const slotsCount = street.slotsPerLevel || 8;

    levels.forEach(level => {
      for (let s = 1; s <= slotsCount; s++) {
        const slotCode = `${level}${s}`;
        const slot = getSlot(streetId, slotCode);
        if (slot && slot.items && slot.items.length > 0) {
          slot.items.forEach(item => {
            const { code, desc } = extractProductCodeAndDesc(item.productName);
            list.push({
              streetId,
              streetName,
              slotCode,
              address: `${streetName} - ${slotCode}`,
              productName: item.productName,
              code: code,
              description: desc,
              lot: (item.lot || '').trim(),
              quantity: Number(item.quantity) || 0
            });
          });
        }
      }
    });
  });
  return list;
}

function getConsolidatedStockItems() {
  const all = getAllStockItems();
  const map = new Map();

  all.forEach(it => {
    const key = `${(it.code || '').toLowerCase()}___${(it.lot || '').toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        code: it.code,
        description: it.description,
        lot: it.lot,
        quantity: 0,
        locations: []
      });
    }
    const entry = map.get(key);
    entry.quantity += it.quantity;
    if (!entry.locations.includes(it.address)) {
      entry.locations.push(it.address);
    }
  });

  return Array.from(map.values());
}

function openStockModal() {
  const modal = document.getElementById('stock-modal');
  if (!modal) return;

  // Atualizar ruas no dropdown
  const streetSelect = document.getElementById('filter-stock-street');
  if (streetSelect) {
    const currentVal = streetSelect.value;
    streetSelect.innerHTML = '<option value="ALL">Todas as Ruas</option>';
    const sortedStreets = getSortedStreets('NUM_ASC');
    sortedStreets.forEach(street => {
      const opt = document.createElement('option');
      opt.value = street.id;
      opt.textContent = street.name;
      streetSelect.appendChild(opt);
    });
    if (currentVal) streetSelect.value = currentVal;
  }

  renderStockTable();
  modal.showModal();
}

function renderStockTable() {
  const tbody = document.getElementById('stock-table-body');
  const theadRow = document.getElementById('stock-table-head-row');
  const grouping = document.getElementById('filter-stock-grouping')?.value || 'BY_SLOT';
  const streetFilter = document.getElementById('filter-stock-street')?.value || 'ALL';
  const searchTerm = (document.getElementById('filter-stock-search')?.value || '').toLowerCase().trim();

  let items = grouping === 'CONSOLIDATED' ? getConsolidatedStockItems() : getAllStockItems();

  if (streetFilter !== 'ALL' && grouping === 'BY_SLOT') {
    items = items.filter(it => it.streetId === streetFilter);
  }

  if (searchTerm) {
    items = items.filter(it =>
      (it.code && it.code.toLowerCase().includes(searchTerm)) ||
      (it.description && it.description.toLowerCase().includes(searchTerm)) ||
      (it.lot && it.lot.toLowerCase().includes(searchTerm)) ||
      (it.slotCode && it.slotCode.toLowerCase().includes(searchTerm)) ||
      (it.address && it.address.toLowerCase().includes(searchTerm))
    );
  }

  // Atualizar contadores
  const uniqueSkus = new Set(items.map(it => it.code.toLowerCase())).size;
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const occupiedSlots = new Set(items.map(it => it.address)).size;

  const countBadge = document.getElementById('stock-unique-items-count');
  if (countBadge) countBadge.textContent = uniqueSkus;
  const unitsBadge = document.getElementById('stock-total-units-count');
  if (unitsBadge) unitsBadge.textContent = `${totalUnits.toLocaleString('pt-BR')} un`;
  const slotsBadge = document.getElementById('stock-occupied-slots-count');
  if (slotsBadge) slotsBadge.textContent = occupiedSlots;

  const footerRecords = document.getElementById('stock-records-count');
  if (footerRecords) footerRecords.textContent = `Exibindo ${items.length} ${items.length === 1 ? 'registro' : 'registros'}`;

  // Cabeçalho da tabela
  if (theadRow) {
    if (grouping === 'CONSOLIDATED') {
      theadRow.innerHTML = `
        <th>Código</th>
        <th>Descrição</th>
        <th>Lote</th>
        <th>Saldo Total (un)</th>
        <th colspan="2">Posições no Galpão</th>
      `;
    } else {
      theadRow.innerHTML = `
        <th>Código</th>
        <th>Descrição</th>
        <th>Lote</th>
        <th>Saldo (un)</th>
        <th>Rua</th>
        <th>Vaga</th>
      `;
    }
  }

  tbody.innerHTML = '';
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align: center; padding: 2rem;">Nenhum material em estoque encontrado com os filtros aplicados.</td></tr>`;
    return;
  }

  items.forEach(it => {
    const tr = document.createElement('tr');
    if (grouping === 'CONSOLIDATED') {
      tr.innerHTML = `
        <td><strong style="color: #ffffff; font-family: 'JetBrains Mono', monospace;">${escapeHtml(it.code)}</strong></td>
        <td>${escapeHtml(it.description)}</td>
        <td>${it.lot ? `<span class="inv-location-tag">Lt: ${escapeHtml(it.lot)}</span>` : '<span class="text-dim">Sem lote</span>'}</td>
        <td><strong style="color: #38bdf8; font-family: 'JetBrains Mono', monospace;">${it.quantity.toLocaleString('pt-BR')} un</strong></td>
        <td colspan="2"><span style="color: #94a3b8; font-size: 0.8rem;">${it.locations ? escapeHtml(it.locations.join(' | ')) : ''}</span></td>
      `;
    } else {
      tr.innerHTML = `
        <td><strong style="color: #ffffff; font-family: 'JetBrains Mono', monospace;">${escapeHtml(it.code)}</strong></td>
        <td>${escapeHtml(it.description)}</td>
        <td>${it.lot ? `<span class="inv-location-tag">Lt: ${escapeHtml(it.lot)}</span>` : '<span class="text-dim">Sem lote</span>'}</td>
        <td><strong style="color: #38bdf8; font-family: 'JetBrains Mono', monospace;">${it.quantity.toLocaleString('pt-BR')} un</strong></td>
        <td>${escapeHtml(it.streetName)}</td>
        <td><span class="inv-location-tag">${escapeHtml(it.slotCode)}</span></td>
      `;
    }
    tbody.appendChild(tr);
  });
}

function exportStockToExcel() {
  const grouping = document.getElementById('filter-stock-grouping')?.value || 'BY_SLOT';
  const streetFilter = document.getElementById('filter-stock-street')?.value || 'ALL';
  const searchTerm = (document.getElementById('filter-stock-search')?.value || '').toLowerCase().trim();

  let items = grouping === 'CONSOLIDATED' ? getConsolidatedStockItems() : getAllStockItems();

  if (streetFilter !== 'ALL' && grouping === 'BY_SLOT') {
    items = items.filter(it => it.streetId === streetFilter);
  }
  if (searchTerm) {
    items = items.filter(it =>
      (it.code && it.code.toLowerCase().includes(searchTerm)) ||
      (it.description && it.description.toLowerCase().includes(searchTerm)) ||
      (it.lot && it.lot.toLowerCase().includes(searchTerm)) ||
      (it.slotCode && it.slotCode.toLowerCase().includes(searchTerm)) ||
      (it.address && it.address.toLowerCase().includes(searchTerm))
    );
  }

  if (items.length === 0) {
    alert('Nenhum item em estoque para exportar com os filtros selecionados.');
    return;
  }

  let header = [];
  let rows = [];

  if (grouping === 'CONSOLIDATED') {
    header = ['Codigo', 'Descricao', 'Lote', 'Quantidade_Total', 'Posicoes'];
    rows = items.map(it => [
      it.code,
      it.description,
      it.lot || 'SEM LOTE',
      it.quantity,
      it.locations ? it.locations.join(' | ') : ''
    ]);
  } else {
    header = ['Codigo', 'Descricao', 'Lote', 'Quantidade', 'Rua', 'Vaga', 'Endereco_Completo'];
    rows = items.map(it => [
      it.code,
      it.description,
      it.lot || '',
      it.quantity,
      it.streetName,
      it.slotCode,
      it.address
    ]);
  }

  const aoa = [header, ...rows];

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!cols'] = [
      { wch: 22 },
      { wch: 45 },
      { wch: 18 },
      { wch: 16 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'ESTOQUE');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Estoque_Geral_Almoxarifado_${today}.xlsx`);
  } else {
    const csvContent = '\uFEFF' + aoa.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Estoque_Geral_Almoxarifado_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

// =============================================================================
// SISTEMA DE INVENTÁRIO FÍSICO & RECONTAGENS
// =============================================================================

let inventoryState = {
  isRecountSheet: false,
  activePhase: 1, // 1 (Confronto Saldo ERP vs Físico), 2 (2ª contagem), 3 (3ª contagem...)
  items: [],
  fileName: '',
  divergentCount: 0,
  approvedCount: 0,
  missingCount: 0,
  totalItems: 0,
  totalPhysicalUnits: 0,
  totalERPUnits: 0,
  accuracyRate: 100.0
};

function openInventoryModal() {
  const modal = document.getElementById('inventory-modal');
  if (!modal) return;
  modal.showModal();
}

function downloadInventoryTemplate() {
  const consolidated = getConsolidatedStockItems();
  // Formato oficial de 4 colunas solicitado: Coluna A: Codigo, B: Descrição, C: Lote, D: SALDO DO SISTEMA
  const header = ['Codigo', 'Descricao', 'Lote', 'SALDO DO SISTEMA'];

  consolidated.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  let rows = [];
  if (consolidated.length > 0) {
    rows = consolidated.map(it => [
      it.code,
      it.description,
      it.lot || '',
      it.quantity // Preenchido com saldo atual das vagas como base para confronto
    ]);
  } else {
    rows = [
      ['1040', 'Parafuso Sextavado M8x25', 'LT-2026A', 150],
      ['1041', 'Fita Adesiva Kraft 48mm', '', 320],
      ['1042', 'Tubo PVC 100mm Esgoto 6m', 'LOTE-99', 85]
    ];
  }

  const aoa = [header, ...rows];

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 48 },
      { wch: 20 },
      { wch: 24 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'SALDO_SISTEMA');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Modelo_Saldo_Sistema_ERP_4Colunas_${today}.xlsx`);
  } else {
    alert('Biblioteca de planilhas indisponível.');
  }
}

function handleInventoryExcelUpload(file) {
  if (!file) return;
  inventoryState.fileName = file.name;

  if (typeof XLSX === 'undefined') {
    alert('Erro: Biblioteca XLSX não disponível no navegador.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {
        type: 'array',
        cellText: true,
        cellDates: true
      });

      const firstSheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[firstSheetName];
      if (!ws) {
        alert('A planilha selecionada está vazia.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      });

      if (!rows || rows.length <= 1) {
        alert('A planilha não contém dados suficientes para análise.');
        return;
      }

      processInventoryAnalysis(rows);
    } catch (err) {
      console.error('Erro ao ler planilha de inventário:', err);
      alert('Erro ao processar planilha: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function processInventoryAnalysis(rows) {
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    alert('A planilha não possui dados a serem confrontados.');
    return;
  }

  function parseCountCell(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const clean = String(v).trim().replace(/\./g, '').replace(',', '.');
    const num = Number(clean);
    return isNaN(num) ? null : Math.round(num);
  }

  // Detectar se a planilha é de Recontagem (possui valores nas colunas E ou F preenchidos)
  let maxColCountFilled = 3;
  dataRows.forEach(r => {
    for (let c = 3; c < r.length; c++) {
      if (parseCountCell(r[c]) !== null) {
        if (c > maxColCountFilled) maxColCountFilled = c;
      }
    }
  });

  const isRecountSheet = maxColCountFilled >= 4; // Coluna E (índice 4 = 2ª Contagem) ou além
  const activePhase = isRecountSheet ? maxColCountFilled - 2 : 1;
  inventoryState.activePhase = activePhase;
  inventoryState.isRecountSheet = isRecountSheet;

  // 1. Mapear estoque físico consolidado atual das vagas do Almoxarifado Pro
  const allStock = getAllStockItems();
  const physicalMap = new Map();

  allStock.forEach(it => {
    const c = String(it.code || '').trim().toLowerCase();
    const l = String(it.lot || '').trim().toLowerCase();
    const key = `${c}___${l}`;

    if (!physicalMap.has(key)) {
      physicalMap.set(key, {
        code: it.code,
        description: it.description,
        lot: it.lot || '',
        physicalQty: 0,
        addresses: [],
        matched: false
      });
    }

    const entry = physicalMap.get(key);
    entry.physicalQty += Number(it.quantity) || 0;
    if (it.address && !entry.addresses.includes(it.address)) {
      entry.addresses.push(it.address);
    }
  });

  const analyzedItems = [];

  // 2. Analisar cada linha da planilha de Saldo do Sistema ERP importada
  dataRows.forEach(r => {
    const code = String(r[0] || '').trim();
    const desc = String(r[1] || '').trim();
    const lot = String(r[2] || '').trim();

    if (!code && !desc) return; // Linha em branco

    const c1 = parseCountCell(r[3]); // Saldo do Sistema (ou 1ª contagem se for recontagem)
    const c2 = parseCountCell(r[4]); // 2ª contagem física
    const c3 = parseCountCell(r[5]); // 3ª contagem física
    const c4 = parseCountCell(r[6]); // 4ª contagem física

    const cKey = code.toLowerCase();
    const lKey = lot.toLowerCase();
    const key = `${cKey}___${lKey}`;

    let physicalQty = 0;
    let locations = '(Não consta nas vagas)';
    let isPhysicalPresent = false;

    if (physicalMap.has(key)) {
      const phys = physicalMap.get(key);
      physicalQty = phys.physicalQty;
      locations = phys.addresses.length > 0 ? phys.addresses.join(', ') : '(Sem endereço)';
      phys.matched = true;
      isPhysicalPresent = true;
    } else {
      // Se não tem lote informado na planilha ERP, buscar itens desse código no estoque físico
      if (!lot) {
        const matches = [];
        physicalMap.forEach((val, k) => {
          if (k.startsWith(`${cKey}___`) && !val.matched) {
            matches.push(val);
          }
        });
        if (matches.length > 0) {
          physicalQty = matches.reduce((sum, m) => sum + m.physicalQty, 0);
          locations = matches.flatMap(m => m.addresses).join(', ');
          matches.forEach(m => { m.matched = true; });
          isPhysicalPresent = true;
        }
      }
    }

    const erpQty = c1 !== null ? c1 : 0;
    let status = 'APPROVED';
    let statusLabel = '🟢 100% Acurado';
    let statusClass = 'row-approved';
    let needsRecount = false;
    let finalCount = physicalQty;

    if (!isRecountSheet) {
      // MODO PRINCIPAL: CONFRONTO DIRETO DE SALDO ERP (PLANILHA) VS SALDO FÍSICO (VAGAS)
      if (!isPhysicalPresent || physicalQty === 0) {
        // Consta no ERP, mas ausente fisicamente no Almoxarifado
        status = 'MISSING_PHYSICAL';
        statusLabel = '⚠️ Falta no Almoxarifado';
        statusClass = 'row-divergent-2';
        needsRecount = true;
        finalCount = 0;
      } else if (physicalQty === erpQty) {
        // Saldo bateu 100%!
        status = 'APPROVED';
        statusLabel = '🟢 100% Acurado';
        statusClass = 'row-approved';
        needsRecount = false;
        finalCount = physicalQty;
      } else {
        // Quantidades divergentes
        status = 'DIVERGENT_SALDO';
        statusLabel = physicalQty > erpQty ? '🔴 Sobra no Físico (+)' : '🔴 Falta no Físico (-)';
        statusClass = 'row-divergent-1';
        needsRecount = true;
        finalCount = physicalQty;
      }
    } else {
      // MODO RECONTAGEM: Quando o usuário reenvia a planilha com 2ª ou 3ª contagens preenchidas
      if (activePhase === 2) {
        if (c2 !== null) {
          // Regra de validação: Se 2ª contagem bate com ERP ou com 1ª contagem -> Aprovado!
          if (c2 === erpQty || (c1 !== null && c2 === c1)) {
            status = 'APPROVED';
            statusLabel = '🟢 Aprovado (2ª Contagem)';
            statusClass = 'row-approved';
            needsRecount = false;
            finalCount = c2;
          } else {
            status = 'DIVERGENT_2';
            statusLabel = '🔴 Divergente (Requer 3ª Cont.)';
            statusClass = 'row-divergent-2';
            needsRecount = true;
            finalCount = c2;
          }
        } else {
          needsRecount = true;
          status = 'DIVERGENT_2';
          statusLabel = '🔴 Recontagem 2ª Fase Pendente';
          statusClass = 'row-divergent-2';
          finalCount = c1 || physicalQty;
        }
      } else if (activePhase >= 3) {
        if (c3 !== null) {
          if (c3 === erpQty || (c2 !== null && c3 === c2)) {
            status = 'APPROVED';
            statusLabel = '🟢 Aprovado (3ª Contagem)';
            statusClass = 'row-approved';
            needsRecount = false;
            finalCount = c3;
          } else {
            status = 'DIVERGENT_3';
            statusLabel = '⚠️ Divergência Crítica (3ª Cont.)';
            statusClass = 'row-divergent-3';
            needsRecount = true;
            finalCount = c3;
          }
        } else {
          needsRecount = true;
          status = 'DIVERGENT_3';
          statusLabel = '⚠️ Recontagem 3ª Fase Pendente';
          statusClass = 'row-divergent-3';
          finalCount = c2 || c1 || physicalQty;
        }
      }
    }

    const diff = finalCount - erpQty;

    analyzedItems.push({
      code,
      description: desc,
      lot,
      erpQty,
      physicalQty,
      c1,
      c2,
      c3,
      c4,
      finalCount,
      diff,
      status,
      statusLabel,
      statusClass,
      needsRecount,
      locations
    });
  });

  // 3. Identificar SOBRAS FÍSICAS (Itens no Almoxarifado Pro que NÃO vieram na planilha ERP)
  physicalMap.forEach((phys) => {
    if (!phys.matched && phys.physicalQty > 0) {
      analyzedItems.push({
        code: phys.code,
        description: phys.description,
        lot: phys.lot,
        erpQty: 0,
        physicalQty: phys.physicalQty,
        c1: phys.physicalQty,
        c2: null,
        c3: null,
        c4: null,
        finalCount: phys.physicalQty,
        diff: phys.physicalQty,
        status: 'SURPLUS_PHYSICAL',
        statusLabel: '⚠️ Sobra Física (Não Consta no ERP)',
        statusClass: 'row-divergent-3',
        needsRecount: true,
        locations: phys.addresses.length > 0 ? phys.addresses.join(', ') : '(Sem endereço)'
      });
    }
  });

  // 4. Calcular métricas consolidadas e MEDIDOR DE ACURÁCIA
  inventoryState.items = analyzedItems;
  inventoryState.totalItems = analyzedItems.length;
  inventoryState.approvedCount = analyzedItems.filter(it => !it.needsRecount).length;
  inventoryState.divergentCount = analyzedItems.filter(it => it.needsRecount).length;
  inventoryState.missingCount = analyzedItems.filter(it => it.status === 'MISSING_PHYSICAL' || it.status === 'SURPLUS_PHYSICAL').length;

  const totalPhysicalUnits = analyzedItems.reduce((acc, it) => acc + (it.physicalQty || 0), 0);
  const totalERPUnits = analyzedItems.reduce((acc, it) => acc + (it.erpQty || 0), 0);
  inventoryState.totalPhysicalUnits = totalPhysicalUnits;
  inventoryState.totalERPUnits = totalERPUnits;

  // Fórmula exata da Acurácia: (Itens Aprovados / Total Auditado) * 100
  inventoryState.accuracyRate = inventoryState.totalItems > 0
    ? Number(((inventoryState.approvedCount / inventoryState.totalItems) * 100).toFixed(1))
    : 100.0;

  renderInventoryResults();
}

function renderInventoryResults() {
  const accuracyCard = document.getElementById('inventory-accuracy-card');
  const panel = document.getElementById('inventory-kpis-panel');
  const controls = document.getElementById('inventory-table-controls');
  const tableWrapper = document.getElementById('inventory-table-wrapper');
  const tbody = document.getElementById('inventory-table-body');
  const theadRow = document.getElementById('inventory-table-head-row');
  const recountBtn = document.getElementById('btn-download-recount');
  const exportAnalysisBtn = document.getElementById('btn-export-inv-analysis');
  const applyBtn = document.getElementById('btn-apply-inventory-adjust');
  const fileStatusTitle = document.getElementById('inventory-file-status-title');
  const footerText = document.getElementById('inventory-summary-footer-text');

  if (!panel || !tableWrapper || !tbody) return;

  if (accuracyCard) accuracyCard.classList.remove('hidden');
  panel.classList.remove('hidden');
  controls.classList.remove('hidden');
  tableWrapper.classList.remove('hidden');
  if (exportAnalysisBtn) exportAnalysisBtn.classList.remove('hidden');

  // Atualizar Medidor Visual de Acuracidade
  const accuracyPct = inventoryState.accuracyRate;
  const pctEl = document.getElementById('accuracy-meter-pct');
  const badgeEl = document.getElementById('accuracy-meter-badge');
  const fillEl = document.getElementById('accuracy-bar-fill');
  const summaryEl = document.getElementById('accuracy-summary-text');
  const summaryUnitsEl = document.getElementById('accuracy-summary-units');

  if (pctEl) {
    pctEl.textContent = `${accuracyPct.toFixed(1)}%`;
  }

  if (fillEl) {
    fillEl.style.width = `${Math.min(100, Math.max(0, accuracyPct))}%`;
    fillEl.className = 'accuracy-bar-fill';
    if (accuracyPct >= 95) {
      fillEl.classList.add('fill-excellent');
      if (pctEl) pctEl.style.color = '#10b981';
      if (badgeEl) {
        badgeEl.className = 'accuracy-badge accuracy-badge-excellent';
        badgeEl.textContent = '🟢 Alta Acuracidade';
      }
    } else if (accuracyPct >= 85) {
      fillEl.classList.add('fill-good');
      if (pctEl) pctEl.style.color = '#f59e0b';
      if (badgeEl) {
        badgeEl.className = 'accuracy-badge accuracy-badge-good';
        badgeEl.textContent = '🟡 Atenção: Divergências';
      }
    } else {
      fillEl.classList.add('fill-critical');
      if (pctEl) pctEl.style.color = '#ef4444';
      if (badgeEl) {
        badgeEl.className = 'accuracy-badge accuracy-badge-critical';
        badgeEl.textContent = '🔴 Acuracidade Crítica';
      }
    }
  }

  if (summaryEl) {
    if (inventoryState.divergentCount === 0) {
      summaryEl.textContent = `Perfeito! 100% dos materiais auditados conferem com o estoque físico nas prateleiras do Almoxarifado Pro.`;
    } else {
      summaryEl.textContent = `${inventoryState.approvedCount} de ${inventoryState.totalItems} materiais conferem perfeitamente. Foram encontradas ${inventoryState.divergentCount} divergências para recontagem.`;
    }
  }

  if (summaryUnitsEl) {
    const diffUnits = inventoryState.totalPhysicalUnits - inventoryState.totalERPUnits;
    const diffSign = diffUnits > 0 ? `+${diffUnits.toLocaleString('pt-BR')}` : diffUnits.toLocaleString('pt-BR');
    summaryUnitsEl.textContent = `Físico: ${inventoryState.totalPhysicalUnits.toLocaleString('pt-BR')} un | ERP: ${inventoryState.totalERPUnits.toLocaleString('pt-BR')} un (Dif: ${diffSign} un)`;
  }

  // Atualiza KPIs
  document.getElementById('inv-kpi-total').textContent = inventoryState.totalItems;
  document.getElementById('inv-kpi-total-units').textContent = `${inventoryState.totalPhysicalUnits.toLocaleString('pt-BR')} un físicas`;
  document.getElementById('inv-kpi-approved').textContent = inventoryState.approvedCount;
  document.getElementById('inv-kpi-divergent').textContent = inventoryState.divergentCount;
  const missingEl = document.getElementById('inv-kpi-missing');
  if (missingEl) missingEl.textContent = inventoryState.missingCount;

  const phaseLabel = document.getElementById('inv-kpi-phase-label');
  if (phaseLabel) {
    phaseLabel.textContent = inventoryState.divergentCount > 0
      ? `Recontagem ${inventoryState.activePhase + 1}ª fase`
      : 'Sem divergências';
  }

  // Atualiza título do arquivo
  if (fileStatusTitle) {
    const phaseName = inventoryState.isRecountSheet ? `Recontagem Fase ${inventoryState.activePhase}` : 'Confronto Saldo ERP';
    fileStatusTitle.innerHTML = `📄 Arquivo: <strong>${escapeHtml(inventoryState.fileName || 'Planilha')}</strong> (${phaseName}) • Acurácia: <strong style="color: #38bdf8;">${inventoryState.accuracyRate}%</strong>`;
  }

  // Botão de Recontagem: exibido apenas se houver itens divergentes
  if (inventoryState.divergentCount > 0) {
    const nextPhase = inventoryState.activePhase + 1;
    recountBtn.classList.remove('hidden');
    recountBtn.innerHTML = `🔄 Baixar Planilha de Recontagem (<span id="recount-items-count">${inventoryState.divergentCount}</span>)`;
    applyBtn.classList.add('hidden');
  } else {
    recountBtn.classList.add('hidden');
    applyBtn.classList.remove('hidden');
  }

  // Filtragem da tabela
  const filterStatus = document.getElementById('filter-inventory-status')?.value || 'ALL';
  const searchTerm = (document.getElementById('filter-inventory-search')?.value || '').toLowerCase().trim();

  let filtered = inventoryState.items;
  if (filterStatus === 'DIVERGENT') {
    filtered = filtered.filter(it => it.needsRecount);
  } else if (filterStatus === 'APPROVED') {
    filtered = filtered.filter(it => !it.needsRecount);
  } else if (filterStatus === 'MISSING_PHYSICAL') {
    filtered = filtered.filter(it => it.status === 'MISSING_PHYSICAL');
  } else if (filterStatus === 'SURPLUS_PHYSICAL') {
    filtered = filtered.filter(it => it.status === 'SURPLUS_PHYSICAL');
  }

  if (searchTerm) {
    filtered = filtered.filter(it =>
      (it.code && it.code.toLowerCase().includes(searchTerm)) ||
      (it.description && it.description.toLowerCase().includes(searchTerm)) ||
      (it.lot && it.lot.toLowerCase().includes(searchTerm)) ||
      (it.locations && it.locations.toLowerCase().includes(searchTerm))
    );
  }

  // Cabeçalho da tabela dinâmico
  if (theadRow) {
    if (inventoryState.isRecountSheet) {
      let colsHtml = `
        <th>Status</th>
        <th>Código</th>
        <th>Descrição</th>
        <th>Lote</th>
        <th>Saldo ERP</th>
        <th>1ª Contagem</th>
        <th>2ª Contagem</th>
      `;
      if (inventoryState.activePhase >= 3) {
        colsHtml += `<th>3ª Contagem</th>`;
      }
      colsHtml += `
        <th>Diferença</th>
        <th>Vagas / Endereço</th>
      `;
      theadRow.innerHTML = colsHtml;
    } else {
      theadRow.innerHTML = `
        <th>Status</th>
        <th>Código</th>
        <th>Descrição</th>
        <th>Lote</th>
        <th>Saldo Sistema (ERP)</th>
        <th>Físico Almoxarifado</th>
        <th>Diferença</th>
        <th>Vagas / Endereço</th>
      `;
    }
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-muted" style="text-align: center; padding: 2rem;">Nenhum item encontrado com o filtro selecionado.</td></tr>`;
  } else {
    filtered.forEach(it => {
      const tr = document.createElement('tr');
      tr.className = it.statusClass;

      let badgeClass = 'badge-inv-approved';
      if (it.status === 'DIVERGENT_SALDO' || it.status === 'DIVERGENT_1') badgeClass = 'badge-inv-recount1';
      else if (it.status === 'DIVERGENT_2') badgeClass = 'badge-inv-recount2';
      else if (it.status === 'DIVERGENT_3') badgeClass = 'badge-inv-recount3';
      else if (it.status === 'MISSING_PHYSICAL') badgeClass = 'badge-inv-missing';
      else if (it.status === 'SURPLUS_PHYSICAL') badgeClass = 'badge-inv-surplus';

      let diffClass = 'inv-diff-zero';
      let diffText = '0 un';
      if (it.diff > 0) {
        diffClass = 'inv-diff-positive';
        diffText = `+${it.diff.toLocaleString('pt-BR')} un`;
      } else if (it.diff < 0) {
        diffClass = 'inv-diff-negative';
        diffText = `${it.diff.toLocaleString('pt-BR')} un`;
      }

      let rowHtml = `
        <td><span class="badge-inv-status ${badgeClass}">${escapeHtml(it.statusLabel)}</span></td>
        <td><strong style="color: #ffffff; font-family: 'JetBrains Mono', monospace;">${escapeHtml(it.code)}</strong></td>
        <td>${escapeHtml(it.description)}</td>
        <td>${it.lot ? `<span class="inv-location-tag">Lt: ${escapeHtml(it.lot)}</span>` : '<span class="text-dim">Sem lote</span>'}</td>
      `;

      if (inventoryState.isRecountSheet) {
        rowHtml += `
          <td><strong style="color: #cbd5e1; font-family: 'JetBrains Mono', monospace;">${it.erpQty.toLocaleString('pt-BR')} un</strong></td>
          <td>${it.c1 !== null ? `${it.c1.toLocaleString('pt-BR')} un` : '<span class="text-dim">-</span>'}</td>
          <td>${it.c2 !== null ? `${it.c2.toLocaleString('pt-BR')} un` : '<span class="text-dim">-</span>'}</td>
        `;
        if (inventoryState.activePhase >= 3) {
          rowHtml += `<td>${it.c3 !== null ? `${it.c3.toLocaleString('pt-BR')} un` : '<span class="text-dim">-</span>'}</td>`;
        }
      } else {
        rowHtml += `
          <td><strong style="color: #cbd5e1; font-family: 'JetBrains Mono', monospace;">${it.erpQty.toLocaleString('pt-BR')} un</strong></td>
          <td><strong style="color: #38bdf8; font-family: 'JetBrains Mono', monospace;">${it.physicalQty.toLocaleString('pt-BR')} un</strong></td>
        `;
      }

      rowHtml += `
        <td class="${diffClass}">${diffText}</td>
        <td><span class="inv-location-tag">${escapeHtml(it.locations)}</span></td>
      `;

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    });
  }

  if (footerText) {
    footerText.textContent = `Total: ${inventoryState.totalItems} materiais confrontados (${inventoryState.approvedCount} aprovados, ${inventoryState.divergentCount} divergentes). Acuracidade: ${inventoryState.accuracyRate}%`;
  }
}

function downloadRecountExcel() {
  const recountItems = inventoryState.items.filter(it => it.needsRecount);
  if (recountItems.length === 0) {
    alert('Parabéns! Não existem itens divergentes para recontar. Todos estão 100% aprovados!');
    return;
  }

  const header = ['Codigo', 'Descricao', 'Lote', 'Primeira contagem', 'Segunda contagem', 'Terceira contagem'];

  // Gera a planilha com a 1ª contagem (saldo físico do almoxarifado) e colunas de 2ª e 3ª contagens abertas
  const rows = recountItems.map(it => [
    it.code,
    it.description,
    it.lot || '',
    it.physicalQty !== undefined ? it.physicalQty : (it.c1 !== null ? it.c1 : ''),
    it.c2 !== null ? it.c2 : '',
    it.c3 !== null ? it.c3 : ''
  ]);

  const aoa = [header, ...rows];

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 48 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'RECONTAGEM');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Planilha_Recontagem_Divergencias_${today}.xlsx`);
  } else {
    alert('Biblioteca de planilhas indisponível.');
  }
}

function exportInventoryAnalysisToExcel() {
  if (!inventoryState.items || inventoryState.items.length === 0) {
    alert('Nenhum dado de inventário disponível para exportar.');
    return;
  }

  const header = ['Status', 'Codigo', 'Descricao', 'Lote', 'Saldo_Sistema_ERP', 'Saldo_Fisico_Almoxarifado', 'Diferenca', 'Posicoes_Vagas'];
  const rows = inventoryState.items.map(it => [
    it.statusLabel.replace(/[🟢🔴⚠️🟠]/g, '').trim(),
    it.code,
    it.description,
    it.lot || 'SEM LOTE',
    it.erpQty,
    it.physicalQty,
    it.diff,
    it.locations || ''
  ]);

  const aoa = [header, ...rows];
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 20 },
      { wch: 45 },
      { wch: 18 },
      { wch: 20 },
      { wch: 25 },
      { wch: 15 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'AUDITORIA_INVENTARIO');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Relatorio_Auditoria_Inventario_${today}.xlsx`);
  }
}

function applyInventoryAdjustments() {
  if (inventoryState.items.length === 0) return;

  const toAdjust = inventoryState.items.filter(it => !it.needsRecount && it.diff !== 0);
  if (toAdjust.length === 0) {
    alert('Todos os itens aprovados já possuem saldo idêntico ao cadastrado no sistema. Nenhum ajuste necessário!');
    return;
  }

  const confirmMsg = `Confirma a atualização de saldo de ${toAdjust.length} materiais no sistema com base no inventário físico aprovado?\n\nEsta ação registrará movimentações de CORREÇÃO com o documento "INVENTARIO-${new Date().getFullYear()}".`;
  if (!confirm(confirmMsg)) return;

  const timestamp = formatCurrentDateTime();
  let adjustedCount = 0;

  toAdjust.forEach(it => {
    let remainingToAdjust = it.finalCount;
    let foundAny = false;

    // Procura vaga com esse item
    allStreetsLoop:
    for (const street of appState.streets) {
      for (const level of (street.levels || ['B', 'A'])) {
        for (let s = 1; s <= (street.slotsPerLevel || 8); s++) {
          const slot = getSlot(street.id, `${level}${s}`);
          if (slot && slot.items) {
            const foundItem = slot.items.find(slotIt => {
              const parsed = extractProductCodeAndDesc(slotIt.productName);
              return parsed.code.toLowerCase() === it.code.toLowerCase() && (slotIt.lot || '').toLowerCase() === (it.lot || '').toLowerCase();
            });

            if (foundItem) {
              const oldQty = foundItem.quantity;
              foundItem.quantity = Math.max(0, it.finalCount);
              foundAny = true;
              adjustedCount++;

              // Registra histórico
              appState.movements.unshift({
                id: 'mov_inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                timestamp: timestamp,
                type: 'CORRECAO',
                streetId: street.id,
                streetName: street.name,
                slotCode: `${level}${s}`,
                productName: foundItem.productName,
                quantity: foundItem.quantity,
                lot: foundItem.lot || '',
                docNumber: `INVENTARIO-${new Date().getFullYear()}`,
                notes: `Ajuste por inventário: de ${oldQty} para ${foundItem.quantity} un (dif: ${it.diff} un).`
              });
              break allStreetsLoop;
            }
          }
        }
      }
    }
  });

  saveState();
  renderAll();

  // Sincroniza Supabase
  if (window.SupabaseService && SupabaseService.isConnected) {
    appState.streets.forEach(street => {
      (street.levels || ['B', 'A']).forEach(level => {
        for (let s = 1; s <= (street.slotsPerLevel || 8); s++) {
          const code = `${level}${s}`;
          const slot = getSlot(street.id, code);
          if (slot && slot.items) {
            SupabaseService.upsertSlot(street.id, code, slot.items);
          }
        }
      });
    });
  }

  alert(`Sucesso! ${adjustedCount} produtos foram ajustados no sistema com auditoria.`);
  document.getElementById('inventory-modal').close();
}

function setupInventoryDragAndDrop() {
  const dropzone = document.getElementById('inventory-upload-zone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#10b981';
      dropzone.style.background = 'rgba(16, 185, 129, 0.1)';
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleInventoryExcelUpload(dt.files[0]);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa controle de acesso
  initAuth();

  // Carrega estado do LocalStorage
  loadState();

  // Renderiza tela inicial
  renderAll();

  // Configura busca global
  setupGlobalSearch();

  // Configura catálogo base e autocomplete
  setupCatalogManager();
  setupProductAutocomplete();
  updateCatalogHints();

  // Configura conexão com Supabase na nuvem e Realtime
  initSupabaseIntegration();

  // Configura gerenciamento de ruas e configurações
  setupStreetManagementEvents();
  setupSettingsAndBackup();

  // Botões de Estoque Geral e Inventário
  document.getElementById('btn-stock-overview').addEventListener('click', openStockModal);
  document.getElementById('btn-inventory').addEventListener('click', openInventoryModal);

  // Eventos do modal de Estoque Geral
  document.getElementById('btn-close-stock-modal').addEventListener('click', () => {
    document.getElementById('stock-modal').close();
  });
  document.getElementById('btn-close-stock-footer').addEventListener('click', () => {
    document.getElementById('stock-modal').close();
  });
  document.getElementById('btn-export-stock-excel').addEventListener('click', exportStockToExcel);
  document.getElementById('filter-stock-search').addEventListener('input', renderStockTable);
  document.getElementById('filter-stock-street').addEventListener('change', renderStockTable);
  document.getElementById('filter-stock-grouping').addEventListener('change', renderStockTable);

  // Eventos do modal de Inventário
  document.getElementById('btn-close-inventory-modal').addEventListener('click', () => {
    document.getElementById('inventory-modal').close();
  });
  document.getElementById('btn-close-inventory-footer').addEventListener('click', () => {
    document.getElementById('inventory-modal').close();
  });
  document.getElementById('btn-download-inv-template').addEventListener('click', downloadInventoryTemplate);
  document.getElementById('btn-trigger-inv-upload').addEventListener('click', () => {
    document.getElementById('inventory-excel-file-input').click();
  });
  document.getElementById('inventory-dropzone').addEventListener('click', () => {
    document.getElementById('inventory-excel-file-input').click();
  });
  document.getElementById('inventory-excel-file-input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleInventoryExcelUpload(e.target.files[0]);
    }
  });
  document.getElementById('btn-download-recount').addEventListener('click', downloadRecountExcel);
  const btnExportInv = document.getElementById('btn-export-inv-analysis');
  if (btnExportInv) {
    btnExportInv.addEventListener('click', exportInventoryAnalysisToExcel);
  }
  document.getElementById('btn-apply-inventory-adjust').addEventListener('click', applyInventoryAdjustments);
  document.getElementById('filter-inventory-search').addEventListener('input', renderInventoryResults);
  document.getElementById('filter-inventory-status').addEventListener('change', renderInventoryResults);
  setupInventoryDragAndDrop();

  // Botões do cabeçalho
  document.getElementById('btn-quick-movement').addEventListener('click', () => {
    openMovementModal({ type: 'ENTRADA' });
  });

  document.getElementById('btn-history').addEventListener('click', () => {
    openHistoryModal();
  });

  // Eventos do formulário de movimentação
  document.getElementById('movement-form').addEventListener('submit', handleMovementSubmit);

  // Botão Adicionar Item à Fila (Entrada Multi-Itens)
  const btnAddStaged = document.getElementById('btn-add-staged-item');
  if (btnAddStaged) {
    btnAddStaged.addEventListener('click', (e) => {
      e.preventDefault();
      addCurrentItemToStaging();
    });
  }

  // Botão Limpar Fila (Entrada Multi-Itens)
  const btnClearStaged = document.getElementById('btn-clear-staged-items');
  if (btnClearStaged) {
    btnClearStaged.addEventListener('click', (e) => {
      e.preventDefault();
      stagedEntryItems = [];
      renderStagedEntryItems();
    });
  }

  // Atalho Enter nos campos de quantidade ou lote para enfileirar rapidamente quando for Entrada
  ['move-qty', 'move-lot'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        const type = document.querySelector('input[name="movementType"]:checked')?.value;
        if (type === 'ENTRADA' && e.key === 'Enter') {
          e.preventDefault();
          addCurrentItemToStaging();
        }
      });
    }
  });

  // Mudança do tipo de movimentação (Entrada, Saída, Correção)
  document.querySelectorAll('input[name="movementType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateTypeSelectorUI(e.target.value);
    });
  });

  // Mudança de rua ou vaga no formulário
  document.getElementById('move-street').addEventListener('change', (e) => {
    updateSlotSelectOptions(e.target.value);
  });

  document.getElementById('move-slot').addEventListener('change', () => {
    handleSlotChangeInForm();
  });

  document.getElementById('move-product-select').addEventListener('change', () => {
    updateQtyHintForSelectedProduct();
  });

  // Fechamento de modais
  document.getElementById('btn-close-movement-modal').addEventListener('click', () => {
    stagedEntryItems = [];
    renderStagedEntryItems();
    document.getElementById('movement-modal').close();
  });
  document.getElementById('btn-cancel-movement').addEventListener('click', () => {
    stagedEntryItems = [];
    renderStagedEntryItems();
    document.getElementById('movement-modal').close();
  });

  document.getElementById('btn-close-details-modal').addEventListener('click', () => {
    document.getElementById('slot-details-modal').close();
  });
  document.getElementById('btn-close-slot-details').addEventListener('click', () => {
    document.getElementById('slot-details-modal').close();
  });

  document.getElementById('btn-close-history-modal').addEventListener('click', () => {
    document.getElementById('history-modal').close();
  });
  document.getElementById('btn-close-history-footer').addEventListener('click', () => {
    document.getElementById('history-modal').close();
  });

  document.getElementById('btn-close-manage-street-modal').addEventListener('click', () => {
    document.getElementById('manage-street-modal').close();
  });
  document.getElementById('btn-cancel-manage-street').addEventListener('click', () => {
    document.getElementById('manage-street-modal').close();
  });

  document.getElementById('btn-close-settings-modal').addEventListener('click', () => {
    document.getElementById('settings-modal').close();
  });
  document.getElementById('btn-close-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').close();
  });

  // Filtros de histórico
  document.getElementById('filter-history-text').addEventListener('input', renderHistoryTable);
  document.getElementById('filter-history-type').addEventListener('change', renderHistoryTable);
  document.getElementById('filter-history-street').addEventListener('change', renderHistoryTable);
  document.getElementById('btn-export-csv').addEventListener('click', exportHistoryToCSV);
});
