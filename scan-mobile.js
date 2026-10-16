/**
 * ENTRADA / SAÍDA PELO CELULAR (fluxo manual, com teclado numérico)
 *
 * Módulo independente: NÃO altera o app.js. Usa estas funções/variáveis globais dele:
 * appState, getAllStockItems, getSlot, getStreetLevels, getStreetSlotsPerLevel,
 * saveState, renderAll, cleanLotForComparison, formatCurrentDateTime e SupabaseService.
 *
 * Fluxo:  1) digita o código (teclado numérico)  ->  escolhe o item
 *         2) quantidade e lote (numéricos)
 *         3) ENTRADA: escolhe Rua/Vaga  |  SAÍDA: escolhe a vaga onde o item está
 *         4) confirma
 */
(function () {
  'use strict';

  const DEFAULT_DOC_IN = 'Entrada via celular';
  const DEFAULT_DOC_OUT = 'Baixa via celular';
  const MIN_CHARS = 3;     // mínimo de caracteres do código para começar a buscar
  const MAX_RESULTS = 8;

  // ---------------------------------------------------------------------------
  // UTILITÁRIOS
  // ---------------------------------------------------------------------------
  function normCode(v) {
    return String(v === null || v === undefined ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function lotKey(v) {
    const base = (typeof cleanLotForComparison === 'function') ? cleanLotForComparison(v) : v;
    return normCode(base);
  }

  function lotMatch(a, b) { return lotKey(a) === lotKey(b); }

  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Quanto o código combina com o que foi digitado (menor = melhor; -1 = não combina)
  function rankOf(codeNorm, q) {
    if (codeNorm === q) return 0;
    if (codeNorm.endsWith(q)) return 1;
    if (codeNorm.startsWith(q)) return 2;
    if (codeNorm.indexOf(q) >= 0) return 3;
    return -1;
  }

  function sortByRank(list) {
    list.sort(function (a, b) {
      return a.rank - b.rank || normCode(a.code).length - normCode(b.code).length || (a.code < b.code ? -1 : 1);
    });
    return list.slice(0, MAX_RESULTS);
  }

  // ---------------------------------------------------------------------------
  // BUSCAS
  // ---------------------------------------------------------------------------

  // ENTRADA: produtos do catálogo cujo código contém o que foi digitado
  function searchCatalog(q) {
    const nq = normCode(q);
    if (nq.length < MIN_CHARS) return [];
    const cat = (typeof appState !== 'undefined' && appState.catalog) ? appState.catalog : [];
    const out = [];
    for (let i = 0; i < cat.length; i++) {
      const it = cat[i];
      if (!it || !it.code) continue;
      const r = rankOf(normCode(it.code), nq);
      if (r >= 0) out.push({ code: it.code, description: it.description || it.code, rank: r });
    }
    return sortByRank(out);
  }

  // SAÍDA: produtos que estão armazenados, agrupados por código
  function searchStockProducts(q, stock) {
    const nq = normCode(q);
    if (nq.length < MIN_CHARS) return [];
    const map = new Map();
    stock.forEach(function (e) {
      const ec = normCode(e.code);
      if (!ec) return;
      const r = rankOf(ec, nq);
      if (r < 0) return;
      let g = map.get(ec);
      if (!g) {
        g = { code: e.code, description: e.description, rank: r, total: 0, spots: 0 };
        map.set(ec, g);
      }
      g.total += e.quantity;
      g.spots += 1;
    });
    return sortByRank(Array.from(map.values()));
  }

  function stockEntriesFor(code) {
    const nc = normCode(code);
    return getAllStockItems().filter(function (e) { return normCode(e.code) === nc; });
  }

  // ---------------------------------------------------------------------------
  // GRAVAÇÃO (mesma regra de negócio do app.js)
  // ---------------------------------------------------------------------------
  function persistMovement(mov, streetId, slotCode, items) {
    appState.movements.unshift(mov);
    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.insertMovement(mov);
    }
    saveState();
    renderAll();
    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.upsertSlot(streetId, slotCode, items);
    }
  }

  function execSaida(sel, qty, doc) {
    const slot = getSlot(sel.streetId, sel.slotCode);
    const items = slot.items || [];
    const idx = items.findIndex(function (it) {
      return it.productName === sel.productName && (it.lot || '').trim() === (sel.lot || '');
    });
    if (idx < 0) {
      throw new Error('Este item não está mais nesta vaga (outro usuário pode ter alterado). Volte e escolha novamente.');
    }
    const target = items[idx];
    if (qty > target.quantity) {
      throw new Error('Erro de Saldo: você tentou dar baixa de ' + qty + ' un, mas a vaga ' + sel.slotCode +
        ' contém apenas ' + target.quantity + ' un.');
    }
    target.quantity -= qty;
    if (target.quantity === 0) items.splice(idx, 1);

    persistMovement({
      id: 'mov_' + Date.now(),
      timestamp: formatCurrentDateTime(),
      type: 'SAIDA',
      streetId: sel.streetId,
      streetName: sel.streetName,
      slotCode: sel.slotCode,
      productName: sel.productName,
      quantity: qty,
      lot: sel.lot,
      docNumber: doc,
      notes: 'Saída/Baixa registrada (celular)'
    }, sel.streetId, sel.slotCode, items);
  }

  function execEntrada(product, streetId, slotCode, qty, lot, doc) {
    const street = appState.streets.find(function (s) { return s.id === streetId; });
    const streetName = street ? street.name : streetId;
    const slot = getSlot(streetId, slotCode);
    const items = slot.items || [];
    const productName = '[' + product.code + '] ' + product.description;

    const existing = items.findIndex(function (it) {
      return it.productName.toLowerCase() === productName.toLowerCase() && (it.lot || '') === lot;
    });
    if (existing >= 0) {
      items[existing].quantity += qty;
    } else {
      items.push({ productName: productName, quantity: qty, lot: lot });
    }

    persistMovement({
      id: 'mov_' + Date.now() + '_0_' + Math.random().toString(36).substring(2, 6),
      timestamp: formatCurrentDateTime(),
      type: 'ENTRADA',
      streetId: streetId,
      streetName: streetName,
      slotCode: slotCode,
      productName: productName,
      quantity: qty,
      lot: lot,
      docNumber: doc,
      notes: 'Entrada registrada (celular)'
    }, streetId, slotCode, items);
  }

  // ---------------------------------------------------------------------------
  // INTERFACE
  // ---------------------------------------------------------------------------
  let dlg = null;
  const st = { mode: 'SAIDA', q: '', product: null, qty: '', lot: '', entries: [], picked: null, stock: [] };

  function $(id) { return document.getElementById(id); }

  function buildUI() {
    const bar = document.createElement('div');
    bar.id = 'mobile-scan-bar';
    bar.innerHTML =
      '<button type="button" class="btn btn-success msb-btn" id="msb-in">📥 ENTRADA</button>' +
      '<button type="button" class="btn btn-danger msb-btn" id="msb-out">📤 SAÍDA</button>';
    document.body.appendChild(bar);
    document.body.classList.add('has-scan-bar');

    dlg = document.createElement('dialog');
    dlg.id = 'scan-dialog';
    dlg.className = 'app-dialog scan-dialog';
    dlg.innerHTML =
      '<div class="dialog-card">' +
        '<div class="dialog-header">' +
          '<div class="dialog-title-wrapper">' +
            '<span class="dialog-badge" id="mm-badge">SAÍDA</span>' +
            '<h3 id="mm-title">Digite o código</h3>' +
          '</div>' +
          '<button type="button" class="btn-close" id="mm-close">✕</button>' +
        '</div>' +
        '<div class="dialog-body scan-body" id="mm-body"></div>' +
      '</div>';
    document.body.appendChild(dlg);

    $('msb-in').addEventListener('click', function () { openFlow('ENTRADA'); });
    $('msb-out').addEventListener('click', function () { openFlow('SAIDA'); });
    $('mm-close').addEventListener('click', closeFlow);
  }

  function closeFlow() { if (dlg.open) dlg.close(); }

  function setTitle(t) { $('mm-title').textContent = t; }

  // Botão que alterna entre teclado numérico (123) e de letras (ABC)
  function wireKbToggle(btn, input) {
    btn.addEventListener('click', function () {
      const numeric = input.inputMode === 'numeric';
      input.inputMode = numeric ? 'text' : 'numeric';
      btn.textContent = numeric ? '123' : 'ABC';
      input.blur();
      input.focus();
    });
  }

  function openFlow(type) {
    st.mode = type;
    st.q = '';
    st.product = null;
    st.qty = '';
    st.lot = '';
    st.entries = [];
    st.picked = null;
    st.stock = (type === 'SAIDA') ? getAllStockItems() : [];
    $('mm-badge').textContent = type === 'ENTRADA' ? 'ENTRADA' : 'SAÍDA';
    if (!dlg.open) dlg.showModal();
    renderStep1();
  }

  // ---------- Passo 1: código + escolha do item ----------
  function renderStep1() {
    setTitle('Digite o código');
    const isOut = st.mode === 'SAIDA';
    $('mm-body').innerHTML =
      '<div class="form-group">' +
        '<label class="form-label" for="mm-code">Código do produto' + (isOut ? ' (ou só o final dele)' : '') + '</label>' +
        '<div class="mm-row">' +
          '<input type="text" id="mm-code" class="form-control scan-qty scan-mono" inputmode="numeric" pattern="[0-9]*" ' +
            'autocomplete="off" autocapitalize="characters" placeholder="Digite o código">' +
          '<button type="button" class="btn btn-secondary mm-kb" id="mm-kb">ABC</button>' +
        '</div>' +
        '<small class="mm-help">Digite pelo menos ' + MIN_CHARS + ' caracteres. Dica: dá para digitar só o final do código.</small>' +
      '</div>' +
      '<div id="mm-results" class="scan-cands"></div>';

    const input = $('mm-code');
    input.value = st.q;
    wireKbToggle($('mm-kb'), input);
    input.addEventListener('input', function () { st.q = input.value; renderResults(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#mm-results .scan-cand');
        if (first) first.click();
      }
    });
    renderResults();
    input.focus();
    setTimeout(function () { input.focus(); }, 150);
  }

  function renderResults() {
    const box = $('mm-results');
    const isOut = st.mode === 'SAIDA';
    const nq = normCode(st.q);
    if (nq.length < MIN_CHARS) { box.innerHTML = ''; return; }

    const list = isOut ? searchStockProducts(st.q, st.stock) : searchCatalog(st.q);
    if (!list.length) {
      box.innerHTML = '<div class="scan-empty">' + (isOut
        ? 'Nenhum item com esse código está armazenado.'
        : 'Nenhum produto do catálogo com esse código.') + '</div>';
      return;
    }

    box.innerHTML = list.map(function (c, i) {
      return '<button type="button" class="scan-cand" data-i="' + i + '">' +
        '<div class="scan-cand-desc">' + esc(c.description) + '</div>' +
        '<div class="scan-cand-meta"><span class="scan-mono">' + esc(c.code) + '</span></div>' +
        (isOut ? '<div class="scan-cand-meta">Saldo total: <b>' + c.total + ' un</b> em <b>' + c.spots + (c.spots === 1 ? ' vaga' : ' vagas') + '</b></div>' : '') +
        '</button>';
    }).join('');

    box.querySelectorAll('.scan-cand').forEach(function (b) {
      b.addEventListener('click', function () {
        const c = list[Number(b.dataset.i)];
        st.product = { code: c.code, description: c.description };
        renderStep2();
      });
    });
  }

  // ---------- Passo 2: quantidade e lote ----------
  function productCardHtml(extra) {
    return '<div class="scan-confirm-card ' + (st.mode === 'SAIDA' ? 'out' : 'in') + '">' +
      '<div class="scan-cand-desc">' + esc(st.product.description) + '</div>' +
      '<div class="scan-cand-meta"><span class="scan-mono">' + esc(st.product.code) + '</span></div>' +
      (extra || '') + '</div>';
  }

  function renderStep2() {
    setTitle('Quantidade e lote');
    const isOut = st.mode === 'SAIDA';
    $('mm-body').innerHTML =
      productCardHtml() +
      '<div class="form-group"><label class="form-label" for="mm-qty">Quantidade</label>' +
        '<input type="number" id="mm-qty" class="form-control scan-qty" inputmode="numeric" pattern="[0-9]*" min="1" placeholder="0"></div>' +
      '<div class="form-group"><label class="form-label" for="mm-lot">Lote</label>' +
        '<div class="mm-row">' +
          '<input type="text" id="mm-lot" class="form-control scan-qty scan-mono" inputmode="numeric" pattern="[0-9]*" autocomplete="off" ' +
            'placeholder="' + (isOut ? 'Lote da etiqueta' : 'Deixe vazio se não tiver') + '">' +
          '<button type="button" class="btn btn-secondary mm-kb" id="mm-kb">ABC</button>' +
        '</div></div>' +
      '<div id="mm-err" class="alert-banner alert-danger hidden"></div>' +
      '<button type="button" class="btn btn-primary scan-big" id="mm-next">Próximo →</button>' +
      '<button type="button" class="btn btn-secondary scan-big" id="mm-back">↩ Voltar</button>';

    $('mm-qty').value = st.qty;
    $('mm-lot').value = st.lot;
    wireKbToggle($('mm-kb'), $('mm-lot'));
    $('mm-back').addEventListener('click', renderStep1);
    $('mm-next').addEventListener('click', function () {
      const qty = parseInt($('mm-qty').value, 10);
      if (isNaN(qty) || qty <= 0) { showErr('Por favor, informe uma quantidade válida maior que zero.'); return; }
      st.qty = String(qty);
      st.lot = $('mm-lot').value.trim();
      renderStep3();
    });
    $('mm-lot').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('mm-next').click(); }
    });
    setTimeout(function () { $('mm-qty').focus(); }, 80);
  }

  function showErr(msg) {
    const e = $('mm-err');
    if (!e) return;
    e.textContent = '⚠️ ' + msg;
    e.classList.remove('hidden');
  }
  function hideErr() { const e = $('mm-err'); if (e) e.classList.add('hidden'); }

  // ---------- Passo 3: endereço ----------
  function renderStep3() {
    setTitle(st.mode === 'SAIDA' ? 'Escolha a vaga' : 'Escolha o endereço');
    if (st.mode === 'SAIDA') renderStep3Saida(); else renderStep3Entrada();
  }

  function summaryLine() {
    return '<div class="scan-read-summary">' +
      '<div><small>Quantidade</small><strong>' + esc(st.qty) + ' un</strong></div>' +
      '<div><small>Lote</small><strong class="scan-mono">' + esc(st.lot || 'sem lote') + '</strong></div>' +
      '</div>';
  }

  function renderStep3Saida() {
    const qty = parseInt(st.qty, 10);
    const entries = stockEntriesFor(st.product.code);
    entries.forEach(function (e) {
      e._lotOk = !st.lot || lotMatch(st.lot, e.lot);
      e._enough = e.quantity >= qty;
    });
    entries.sort(function (a, b) {
      return (Number(b._lotOk) - Number(a._lotOk)) || (Number(b._enough) - Number(a._enough)) || (b.quantity - a.quantity);
    });
    st.entries = entries;
    st.picked = null;

    let html = productCardHtml() + summaryLine();

    if (!entries.length) {
      html += '<div class="scan-empty">Este produto não está mais armazenado em nenhuma vaga.</div>';
    } else {
      html += '<div class="scan-section-title">Em qual vaga está? Toque para escolher:</div><div class="scan-cands" id="mm-spots">';
      entries.forEach(function (e, i) {
        let tags = '';
        if (st.lot) tags += e._lotOk ? '<span class="scan-tag ok">✔ lote confere</span>' : '<span class="scan-tag warn">⚠ lote diferente do digitado</span>';
        if (!e._enough) tags += '<span class="scan-tag warn">saldo menor que a quantidade</span>';
        html += '<button type="button" class="scan-cand" data-i="' + i + '"' + (e._enough ? '' : ' disabled') + '>' +
          '<div class="scan-cand-addr">📍 ' + esc(e.address) + '</div>' +
          '<div class="scan-cand-meta">Lote: <b>' + esc(e.lot || 'sem lote') + '</b> · Saldo: <b>' + e.quantity + ' un</b></div>' +
          '<div>' + tags + '</div></button>';
      });
      html += '</div>';
    }
    html += '<div id="mm-confirm"></div>' +
      '<button type="button" class="btn btn-secondary scan-big" id="mm-back">↩ Voltar</button>';
    $('mm-body').innerHTML = html;
    $('mm-back').addEventListener('click', renderStep2);

    document.querySelectorAll('#mm-spots .scan-cand').forEach(function (b) {
      b.addEventListener('click', function () { pickSpot(Number(b.dataset.i)); });
    });

    // Se só existe uma vaga possível, já deixa marcada (ainda precisa confirmar)
    const ok = entries.filter(function (e) { return e._lotOk && e._enough; });
    if (ok.length === 1) pickSpot(entries.indexOf(ok[0]));
  }

  function pickSpot(i) {
    st.picked = st.entries[i];
    document.querySelectorAll('#mm-spots .scan-cand').forEach(function (b) {
      b.classList.toggle('selected', Number(b.dataset.i) === i);
    });
    const e = st.picked;
    let warn = '';
    if (st.lot && !e._lotOk) {
      warn = '<div class="scan-warnline">⚠ O lote digitado (' + esc(st.lot) + ') é diferente do lote desta vaga (' +
        esc(e.lot || 'sem lote') + '). A baixa será feita no lote da vaga.</div>';
    }
    $('mm-confirm').innerHTML =
      '<div class="scan-confirm-card out">' +
        '<div class="scan-cand-meta">Dar baixa de <b>' + esc(st.qty) + ' un</b> na vaga</div>' +
        '<div class="scan-bigaddr">📍 ' + esc(e.address) + '</div>' +
        '<div class="scan-cand-meta">Lote: <b>' + esc(e.lot || 'sem lote') + '</b> · Saldo atual: <b>' + e.quantity + ' un</b></div>' + warn +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="mm-doc">Solicitação / NF / motivo</label>' +
        '<input type="text" id="mm-doc" class="form-control" value="' + DEFAULT_DOC_OUT + '"></div>' +
      '<div id="mm-err" class="alert-banner alert-danger hidden"></div>' +
      '<button type="button" class="btn btn-danger scan-big" id="mm-confirm-btn">✅ Confirmar baixa</button>';
    $('mm-confirm-btn').addEventListener('click', confirmAction);
    $('mm-confirm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function streetOptionsHtml(selectedId) {
    return appState.streets.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
  }

  function slotOptionsHtml(streetId) {
    const street = appState.streets.find(function (s) { return s.id === streetId; });
    if (!street) return '';
    const levels = getStreetLevels(street);
    const per = getStreetSlotsPerLevel(street);
    let html = '';
    levels.forEach(function (lv) {
      for (let n = 1; n <= per; n++) {
        const code = lv + n;
        const slot = appState.slots[streetId + '_' + code];
        const count = slot && slot.items ? slot.items.length : 0;
        const txt = code + (count === 0 ? ' — vazia' : ' — ' + count + (count === 1 ? ' produto' : ' produtos'));
        html += '<option value="' + code + '">' + esc(txt) + '</option>';
      }
    });
    return html;
  }

  function renderStep3Entrada() {
    const loc = stockEntriesFor(st.product.code).slice(0, 3);
    const hint = loc.length
      ? '<div class="scan-cand-meta">Já armazenado em: ' + loc.map(function (e) {
          return '<b>' + esc(e.address) + '</b> (lote ' + esc(e.lot || '—') + ', ' + e.quantity + ' un)';
        }).join('; ') + '</div>'
      : '';

    $('mm-body').innerHTML =
      productCardHtml(hint) + summaryLine() +
      '<div class="form-group"><label class="form-label" for="mm-street">Rua</label>' +
        '<select id="mm-street" class="form-control">' + streetOptionsHtml(appState.activeStreetId) + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="mm-slot">Vaga</label>' +
        '<select id="mm-slot" class="form-control"></select></div>' +
      '<div class="form-group"><label class="form-label" for="mm-doc">Solicitação / NF / motivo</label>' +
        '<input type="text" id="mm-doc" class="form-control" value="' + DEFAULT_DOC_IN + '"></div>' +
      '<div id="mm-err" class="alert-banner alert-danger hidden"></div>' +
      '<button type="button" class="btn btn-success scan-big" id="mm-confirm-btn">✅ Confirmar entrada</button>' +
      '<button type="button" class="btn btn-secondary scan-big" id="mm-back">↩ Voltar</button>';

    const stSel = $('mm-street');
    const slSel = $('mm-slot');
    const fill = function () { slSel.innerHTML = slotOptionsHtml(stSel.value); };
    stSel.addEventListener('change', fill);
    fill();
    $('mm-back').addEventListener('click', renderStep2);
    $('mm-confirm-btn').addEventListener('click', confirmAction);
  }

  // ---------- Confirmar ----------
  function confirmAction() {
    hideErr();
    const qty = parseInt(st.qty, 10);
    const doc = $('mm-doc').value.trim();
    if (isNaN(qty) || qty <= 0) { showErr('Quantidade inválida. Volte e informe a quantidade.'); return; }
    if (!doc) { showErr('Informe o número da Solicitação, NF ou motivo para auditoria.'); return; }

    try {
      if (st.mode === 'SAIDA') {
        if (!st.picked) { showErr('Escolha a vaga onde o item está.'); return; }
        execSaida(st.picked, qty, doc);
      } else {
        execEntrada(st.product, $('mm-street').value, $('mm-slot').value, qty, st.lot, doc);
      }
    } catch (err) {
      showErr(err.message || 'Não foi possível registrar.');
      return;
    }
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    const wasOut = st.mode === 'SAIDA';
    closeFlow();
    toast(wasOut ? 'Baixa registrada ✔' : 'Entrada registrada ✔');
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'scan-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }

  // ---------------------------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------------------------
  window.__scanMobile = { searchCatalog: searchCatalog, searchStockProducts: searchStockProducts, lotMatch: lotMatch, normCode: normCode };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', buildUI);
  }
})();
