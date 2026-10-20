/**
 * MOVER PALETE DE UMA VAGA PARA OUTRA
 *
 * Módulo independente: NÃO altera o app.js. Usa estas funções/variáveis globais dele:
 * appState, getSlot, getStreetLevels, getStreetSlotsPerLevel, extractProductCodeAndDesc,
 * saveState, renderAll, jumpToSlot, formatCurrentDateTime e SupabaseService.
 *
 * Como funciona:
 *  - No celular, a barra de baixo ganha o botão "MOVER": escolhe o palete (por toque) e depois o destino.
 *  - No modal de detalhes da vaga aparece o botão "Mover palete para outra vaga".
 *  - Abre uma tela só com as vagas VAZIAS (por rua/andar). Toca na vaga de destino e confirma.
 *  - Se existir outro palete do MESMO produto com vaga vazia perto, mostra uma sugestão.
 *  - Move o palete inteiro (todos os produtos da vaga) e registra no histórico.
 */
(function () {
  'use strict';

  // O que é "perto": no mesmo andar até 2 vagas de distância; no outro andar até 1 vaga.
  const NEAR_SAME_LEVEL = 2;
  const NEAR_OTHER_LEVEL = 1;
  const MAX_SUGGEST_PALLETS = 3;   // quantos paletes aparecem na dica
  const MAX_SUGGEST_SLOTS = 3;     // quantas vagas vazias por palete na dica
  const MOVE_DOC = 'Mudança de palete';

  // ---------------------------------------------------------------------------
  // UTILITÁRIOS
  // ---------------------------------------------------------------------------
  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function findStreet(id) {
    return appState.streets.find(function (s) { return s.id === id; });
  }

  function streetName(id) {
    const s = findStreet(id);
    return s ? s.name : id;
  }

  function addrOf(streetId, code) { return streetName(streetId) + ' - ' + code; }

  function parseCode(code) {
    const m = /^([A-Za-z]+)(\d+)$/.exec(String(code || ''));
    return m ? { level: m[1].toUpperCase(), n: parseInt(m[2], 10) } : null;
  }

  function isEmptySlot(streetId, code) {
    const sl = appState.slots[streetId + '_' + code];
    return !sl || !sl.items || sl.items.length === 0;
  }

  // Todas as vagas da rua, na ordem dos andares
  function slotCodesOf(street) {
    const levels = getStreetLevels(street);
    const per = getStreetSlotsPerLevel(street);
    const out = [];
    levels.forEach(function (lv) {
      for (let n = 1; n <= per; n++) out.push({ level: lv, code: lv + n, n: n });
    });
    return out;
  }

  // Distância "de prateleira" entre duas vagas da mesma rua (-1 = longe)
  function nearDistance(codeA, codeB) {
    const a = parseCode(codeA), b = parseCode(codeB);
    if (!a || !b) return -1;
    const dn = Math.abs(a.n - b.n);
    if (a.level === b.level) return dn <= NEAR_SAME_LEVEL ? dn : -1;
    return dn <= NEAR_OTHER_LEVEL ? dn + 0.5 : -1;
  }

  function productKey(item) {
    let code = '';
    if (typeof extractProductCodeAndDesc === 'function') {
      const info = extractProductCodeAndDesc(item.productName);
      code = info && info.code ? String(info.code).trim().toUpperCase() : '';
    }
    return code || String(item.productName || '').trim().toLowerCase();
  }

  function productDesc(item) {
    if (typeof extractProductCodeAndDesc === 'function') {
      const info = extractProductCodeAndDesc(item.productName);
      if (info && info.desc) return info.desc;
    }
    return item.productName || '';
  }

  // ---------------------------------------------------------------------------
  // SUGESTÃO: palete do mesmo produto perto de vaga vazia
  // ---------------------------------------------------------------------------
  // Retorna { pallets: [{desc, streetId, code, empties:[{streetId,code,dist}]}], starred:Set('rua|vaga') }
  function computeSuggestions(srcStreetId, srcCode) {
    const srcSlot = appState.slots[srcStreetId + '_' + srcCode];
    const keys = new Set(((srcSlot && srcSlot.items) || []).map(productKey));
    const pairs = new Map();
    const starred = new Set();

    appState.streets.forEach(function (street) {
      const codes = slotCodesOf(street);
      codes.forEach(function (c) {
        if (street.id === srcStreetId && c.code === srcCode) return;      // o próprio palete
        const slot = appState.slots[street.id + '_' + c.code];
        if (!slot || !slot.items || !slot.items.length) return;
        slot.items.forEach(function (it) {
          const k = productKey(it);
          if (!keys.has(k)) return;
          const pk = street.id + '|' + c.code + '|' + k;
          codes.forEach(function (c2) {
            if (!isEmptySlot(street.id, c2.code)) return;
            const d = nearDistance(c.code, c2.code);
            if (d < 0) return;
            let p = pairs.get(pk);
            if (!p) {
              p = { desc: productDesc(it), streetId: street.id, code: c.code, empties: new Map() };
              pairs.set(pk, p);
            }
            const prev = p.empties.get(c2.code);
            if (prev === undefined || d < prev) p.empties.set(c2.code, d);
            starred.add(street.id + '|' + c2.code);
          });
        });
      });
    });

    const pallets = Array.from(pairs.values()).map(function (p) {
      const empties = Array.from(p.empties.entries())
        .map(function (e) { return { streetId: p.streetId, code: e[0], dist: e[1] }; })
        .sort(function (a, b) { return a.dist - b.dist || (parseCode(a.code).n - parseCode(b.code).n); });
      return { desc: p.desc, streetId: p.streetId, code: p.code, empties: empties, best: empties[0].dist };
    }).sort(function (a, b) { return a.best - b.best; });

    return { pallets: pallets, starred: starred };
  }

  // ---------------------------------------------------------------------------
  // MOVER (grava a mudança)
  // ---------------------------------------------------------------------------
  function movePallet(sId, sCode, dId, dCode) {
    if (sId === dId && sCode === dCode) throw new Error('A vaga de destino é a mesma da origem.');
    const src = getSlot(sId, sCode);
    const dst = getSlot(dId, dCode);
    if (!src.items || src.items.length === 0) {
      throw new Error('A vaga de origem está vazia (outro usuário pode ter alterado). Feche e confira o mapa.');
    }
    if (dst.items && dst.items.length > 0) {
      throw new Error('A vaga ' + dCode + ' acabou de ser ocupada. Escolha outra vaga vazia.');
    }

    const moved = src.items.map(function (it) {
      return { productName: it.productName, quantity: it.quantity, lot: it.lot || '' };
    });

    dst.items = moved.map(function (it) { return { productName: it.productName, quantity: it.quantity, lot: it.lot }; });
    src.items = [];

    const ts = formatCurrentDateTime();
    const base = Date.now();
    const srcAddr = addrOf(sId, sCode);
    const dstAddr = addrOf(dId, dCode);
    const records = [];
    moved.forEach(function (it, i) {
      const rnd = Math.random().toString(36).substring(2, 6);
      records.push({
        id: 'mov_' + base + '_' + i + 'o_' + rnd,
        timestamp: ts, type: 'TRANSFERENCIA',
        streetId: sId, streetName: streetName(sId), slotCode: sCode,
        productName: it.productName, quantity: it.quantity, lot: it.lot,
        docNumber: MOVE_DOC, notes: 'Palete saiu desta vaga → ' + dstAddr
      });
      records.push({
        id: 'mov_' + base + '_' + i + 'd_' + rnd,
        timestamp: ts, type: 'TRANSFERENCIA',
        streetId: dId, streetName: streetName(dId), slotCode: dCode,
        productName: it.productName, quantity: it.quantity, lot: it.lot,
        docNumber: MOVE_DOC, notes: 'Palete chegou nesta vaga ← ' + srcAddr
      });
    });

    records.forEach(function (r) {
      appState.movements.unshift(r);
      if (window.SupabaseService && SupabaseService.isConnected) SupabaseService.insertMovement(r);
    });

    saveState();
    renderAll();

    if (window.SupabaseService && SupabaseService.isConnected) {
      SupabaseService.upsertSlot(sId, sCode, src.items);
      SupabaseService.upsertSlot(dId, dCode, dst.items);
    }
  }

  // ---------------------------------------------------------------------------
  // INTERFACE
  // ---------------------------------------------------------------------------
  let dlg = null;
  let current = null;   // vaga aberta no modal de detalhes
  const st = { srcStreetId: null, srcCode: null, items: [], viewStreetId: null, picked: null, sug: null, fromPicker: false, srcView: null };

  function $(id) { return document.getElementById(id); }

  function buildUI() {
    dlg = document.createElement('dialog');
    dlg.id = 'mp-dialog';
    dlg.className = 'app-dialog mp-dialog';
    dlg.innerHTML =
      '<div class="dialog-card">' +
        '<div class="dialog-header">' +
          '<div class="dialog-title-wrapper">' +
            '<span class="dialog-badge">MOVER</span>' +
            '<h3 id="mp-title">Mover palete</h3>' +
          '</div>' +
          '<button type="button" class="btn-close" id="mp-close">✕</button>' +
        '</div>' +
        '<div class="mp-body" id="mp-body"></div>' +
        '<div class="mp-footer" id="mp-footer"></div>' +
      '</div>';
    document.body.appendChild(dlg);
    $('mp-close').addEventListener('click', closeMove);

    // Botão dentro do modal de detalhes da vaga (linha própria, largura total)
    const bar = document.querySelector('#slot-details-modal .quick-actions-bar');
    if (bar) {
      const row = document.createElement('div');
      row.className = 'mp-move-row';
      row.innerHTML = '<button type="button" class="btn btn-primary mp-open-btn" id="btn-slot-quick-move">🔀 Mover palete para outra vaga</button>';
      bar.insertAdjacentElement('afterend', row);
      $('btn-slot-quick-move').addEventListener('click', function () {
        if (!current) return;
        const slot = appState.slots[current.streetId + '_' + current.code];
        if (!slot || !slot.items || slot.items.length === 0) {
          alert('Esta vaga está vazia. Não há palete para mover.');
          return;
        }
        openMove(current.streetId, current.code);
      });
    }

    // Botão MOVER na barra do celular (ao lado de ENTRADA e SAÍDA)
    const mobileBar = $('mobile-scan-bar');
    if (mobileBar && !$('msb-move')) {
      const mb = document.createElement('button');
      mb.type = 'button';
      mb.id = 'msb-move';
      mb.className = 'btn btn-primary msb-btn';
      mb.textContent = '🔀 MOVER';
      mb.addEventListener('click', openPicker);
      mobileBar.appendChild(mb);
    }

    // Filtro "Transferência" no histórico
    const filter = $('filter-history-type');
    if (filter && !filter.querySelector('option[value="TRANSFERENCIA"]')) {
      const opt = document.createElement('option');
      opt.value = 'TRANSFERENCIA';
      opt.textContent = 'Apenas Transferências (mudança de palete)';
      filter.appendChild(opt);
    }
  }

  function closeMove() { if (dlg.open) dlg.close(); }

  function openMove(streetId, code, fromPicker) {
    st.fromPicker = !!fromPicker;
    const slot = getSlot(streetId, code);
    st.srcStreetId = streetId;
    st.srcCode = code;
    st.items = (slot.items || []).map(function (it) { return { productName: it.productName, quantity: it.quantity, lot: it.lot || '' }; });
    st.viewStreetId = streetId;
    st.picked = null;
    st.sug = computeSuggestions(streetId, code);
    $('mp-title').textContent = 'Mover palete de ' + addrOf(streetId, code);
    if (!dlg.open) dlg.showModal();
    render();
  }

  // ---------- Escolher o palete de origem (botão MOVER da barra do celular) ----------
  function occupiedCount(street) {
    return slotCodesOf(street).filter(function (c) { return !isEmptySlot(street.id, c.code); }).length;
  }

  function openPicker() {
    if (!appState.streets || !appState.streets.length) { alert('Nenhuma rua cadastrada.'); return; }
    st.fromPicker = false;
    st.picked = null;
    const act = typeof appState.activeStreetId !== 'undefined' ? findStreet(appState.activeStreetId) : null;
    st.srcView = act ? act.id : appState.streets[0].id;
    $('mp-title').textContent = 'Qual palete mover?';
    if (!dlg.open) dlg.showModal();
    renderPicker();
  }

  function renderPicker() {
    const street = findStreet(st.srcView) || appState.streets[0];
    let html = '<div class="mp-section">Toque no palete que você quer mover</div>';

    html += '<div class="mp-streets">' + appState.streets.map(function (s) {
      const n = occupiedCount(s);
      return '<button type="button" class="mp-street' + (s.id === street.id ? ' active' : '') + '" data-street="' + esc(s.id) + '"' +
        (n === 0 ? ' disabled' : '') + '>' + esc(s.name) + '<small>' + n + (n === 1 ? ' palete' : ' paletes') + '</small></button>';
    }).join('') + '</div>';

    const codes = slotCodesOf(street);
    getStreetLevels(street).forEach(function (lv) {
      const occ = codes.filter(function (c) { return c.level === lv && !isEmptySlot(street.id, c.code); });
      html += '<div class="mp-level"><div class="mp-level-title">Andar ' + esc(lv) + '</div>';
      if (!occ.length) {
        html += '<div class="mp-none">Sem palete neste andar</div>';
      } else {
        html += '<div class="mp-srcs">' + occ.map(function (c) {
          const items = appState.slots[street.id + '_' + c.code].items;
          const first = items[0];
          const extra = items.length > 1 ? ' <b>+' + (items.length - 1) + '</b>' : '';
          return '<button type="button" class="mp-src" data-street="' + esc(street.id) + '" data-code="' + esc(c.code) + '">' +
            '<span class="mp-src-code">' + esc(c.code) + '</span>' +
            '<span class="mp-src-name">' + esc(productDesc(first)) + '</span>' +
            '<span class="mp-src-meta">Lote ' + esc(first.lot || '—') + ' · ' + esc(first.quantity) + ' un' + extra + '</span>' +
            '</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });

    $('mp-body').innerHTML = html;
    $('mp-body').querySelectorAll('.mp-street').forEach(function (b) {
      b.addEventListener('click', function () { st.srcView = b.dataset.street; renderPicker(); });
    });
    $('mp-body').querySelectorAll('.mp-src').forEach(function (b) {
      b.addEventListener('click', function () { openMove(b.dataset.street, b.dataset.code, true); });
    });

    $('mp-footer').innerHTML = '<button type="button" class="btn btn-secondary mp-cancel" id="mp-cancel">Cancelar</button>';
    $('mp-cancel').addEventListener('click', closeMove);
  }

  function emptyCount(street) {
    return slotCodesOf(street).filter(function (c) { return isEmptySlot(street.id, c.code); }).length;
  }

  function originHtml() {
    return '<div class="mp-origin">' +
      '<div class="mp-origin-addr">📦 ' + esc(addrOf(st.srcStreetId, st.srcCode)) + '</div>' +
      st.items.map(function (it) {
        return '<div class="mp-origin-item"><span class="mp-origin-name">' + esc(productDesc(it)) + '</span>' +
          '<span class="mp-origin-meta">Lote: <b>' + esc(it.lot || 'sem lote') + '</b> · <b>' + esc(it.quantity) + ' un</b></span></div>';
      }).join('') +
      (st.items.length > 1 ? '<div class="mp-origin-note">Palete misto: todos os produtos vão juntos.</div>' : '') +
      '</div>';
  }

  function suggestionHtml() {
    const pallets = st.sug ? st.sug.pallets.slice(0, MAX_SUGGEST_PALLETS) : [];
    if (!pallets.length) return '';
    let html = '<div class="mp-sug"><div class="mp-sug-title">💡 Dica: já existe palete do mesmo produto perto de vaga vazia</div>';
    pallets.forEach(function (p) {
      html += '<div class="mp-sug-row"><div class="mp-sug-text"><b>' + esc(p.desc) + '</b> está em <b>' +
        esc(addrOf(p.streetId, p.code)) + '</b>. Vaga vazia perto:</div><div class="mp-sug-chips">';
      p.empties.slice(0, MAX_SUGGEST_SLOTS).forEach(function (e) {
        html += '<button type="button" class="mp-chip mp-sug-chip" data-street="' + esc(e.streetId) + '" data-code="' + esc(e.code) + '">⭐ ' + esc(e.code) + '</button>';
      });
      html += '</div></div>';
    });
    return html + '</div>';
  }

  function render() {
    const street = findStreet(st.viewStreetId) || appState.streets[0];
    let html = originHtml() + suggestionHtml();

    html += '<div class="mp-section">Para onde mover? <small>(só vagas vazias)</small></div>';

    html += '<div class="mp-streets">' + appState.streets.map(function (s) {
      const n = emptyCount(s);
      return '<button type="button" class="mp-street' + (s.id === street.id ? ' active' : '') + '" data-street="' + esc(s.id) + '"' +
        (n === 0 ? ' disabled' : '') + '>' + esc(s.name) + '<small>' + n + (n === 1 ? ' livre' : ' livres') + '</small></button>';
    }).join('') + '</div>';

    const codes = slotCodesOf(street);
    const levels = getStreetLevels(street);
    levels.forEach(function (lv) {
      const empties = codes.filter(function (c) { return c.level === lv && isEmptySlot(street.id, c.code); });
      html += '<div class="mp-level"><div class="mp-level-title">Andar ' + esc(lv) + '</div>';
      if (!empties.length) {
        html += '<div class="mp-none">Sem vaga vazia neste andar</div>';
      } else {
        html += '<div class="mp-slots">' + empties.map(function (c) {
          const star = st.sug && st.sug.starred.has(street.id + '|' + c.code);
          const sel = st.picked && st.picked.streetId === street.id && st.picked.code === c.code;
          return '<button type="button" class="mp-chip' + (star ? ' mp-star' : '') + (sel ? ' selected' : '') +
            '" data-street="' + esc(street.id) + '" data-code="' + esc(c.code) + '">' + (star ? '⭐ ' : '') + esc(c.code) + '</button>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });

    if (st.sug && st.sug.starred.size) {
      html += '<div class="mp-legend">⭐ = vaga vazia perto de palete do mesmo produto</div>';
    }

    $('mp-body').innerHTML = html;

    $('mp-body').querySelectorAll('.mp-street').forEach(function (b) {
      b.addEventListener('click', function () {
        st.viewStreetId = b.dataset.street;
        render();
      });
    });
    $('mp-body').querySelectorAll('.mp-chip').forEach(function (b) {
      b.addEventListener('click', function () { pick(b.dataset.street, b.dataset.code); });
    });

    renderFooter();
  }

  function renderFooter() {
    const f = $('mp-footer');
    if (st.picked) {
      f.innerHTML =
        '<div id="mp-err" class="alert-banner alert-danger hidden"></div>' +
        '<button type="button" class="btn btn-primary mp-confirm" id="mp-confirm">✅ Mover para ' + esc(addrOf(st.picked.streetId, st.picked.code)) + '</button>' +
        '<button type="button" class="btn btn-secondary mp-cancel" id="mp-cancel">Cancelar</button>';
      $('mp-confirm').addEventListener('click', confirmMove);
    } else {
      f.innerHTML =
        '<div id="mp-err" class="alert-banner alert-danger hidden"></div>' +
        '<div class="mp-hint">Toque na vaga de destino</div>' +
        '<button type="button" class="btn btn-secondary mp-cancel" id="mp-cancel">Cancelar</button>';
    }
    $('mp-cancel').addEventListener('click', closeMove);
    if (st.fromPicker) {
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'mp-back';
      back.className = 'btn btn-secondary mp-cancel';
      back.textContent = '↩ Escolher outro palete';
      back.addEventListener('click', function () { st.picked = null; openPicker(); });
      f.insertBefore(back, $('mp-cancel'));
    }
  }

  function pick(streetId, code) {
    st.picked = { streetId: streetId, code: code };
    st.viewStreetId = streetId;
    render();
    const sel = document.querySelector('#mp-body .mp-chip.selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function showErr(msg) {
    const e = $('mp-err');
    if (!e) return;
    e.textContent = '⚠️ ' + msg;
    e.classList.remove('hidden');
  }

  function confirmMove() {
    if (!st.picked) return;
    const p = st.picked;
    try {
      movePallet(st.srcStreetId, st.srcCode, p.streetId, p.code);
    } catch (err) {
      // Atualiza a tela (a vaga pode ter sido ocupada por outra pessoa) e avisa
      st.picked = null;
      st.sug = computeSuggestions(st.srcStreetId, st.srcCode);
      render();
      showErr(err.message || 'Não foi possível mover o palete.');
      return;
    }
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    closeMove();
    const details = $('slot-details-modal');
    if (details && details.open) details.close();
    toast('Palete movido para ' + addrOf(p.streetId, p.code) + ' ✔');
    if (typeof jumpToSlot === 'function') jumpToSlot(p.streetId, p.code);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'mp-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // ---------------------------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------------------------
  // Descobre qual vaga está aberta no modal de detalhes (sem mexer no app.js)
  if (typeof window.openSlotDetailsModal === 'function') {
    const original = window.openSlotDetailsModal;
    window.openSlotDetailsModal = function (streetId, code) {
      current = { streetId: streetId, code: code };
      return original.apply(this, arguments);
    };
  }

  window.__moverPalete = { computeSuggestions: computeSuggestions, movePallet: movePallet, nearDistance: nearDistance, openMove: openMove, openPicker: openPicker, confirmMove: confirmMove, pick: pick };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', buildUI);
  }
})();
