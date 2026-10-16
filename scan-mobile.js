/**
 * ENTRADA / SAÍDA PELO CELULAR - leitura da etiqueta pela câmera (OCR)
 *
 * Módulo independente: NÃO altera o app.js. Usa estas funções/variáveis globais dele:
 * appState, getAllStockItems, getSlot, getStreetLevels, getStreetSlotsPerLevel,
 * saveState, renderAll, cleanLotForComparison e SupabaseService.
 *
 * Etiqueta: o CÓDIGO (COD) é texto impresso (não vem no QR/código de barras), por isso é lido
 * por OCR a partir de UMA foto tirada no toque (quadro vermelho). Lote e quantidade são digitados.
 * Como o OCR pode errar 1 ou 2 dígitos, o resultado é sempre conferido contra o que existe
 * no sistema (busca aproximada) e o operador confirma antes de gravar.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIGURAÇÃO
  // ---------------------------------------------------------------------------
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const MAX_CODE_DIST = 3.0;      // distância máxima aceita entre código lido e código do sistema
  const LOT_OK_DIST = 1.0;        // distância máxima para considerar o lote "conferido"
  const EXPECTED_COD_LEN = 15;    // tamanho típico do código na etiqueta
  // Caracteres aceitos pelo OCR. Só dígitos = mais preciso (etiquetas numéricas).
  // Se alguma etiqueta tiver letras no código, troque por '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.
  const OCR_CHARSET = '0123456789';
  const DEFAULT_DOC_IN = 'Entrada via celular';
  const DEFAULT_DOC_OUT = 'Baixa via celular';

  // ---------------------------------------------------------------------------
  // UTILITÁRIOS DE TEXTO E COMPARAÇÃO APROXIMADA
  // ---------------------------------------------------------------------------
  function normCode(v) {
    return String(v === null || v === undefined ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Pares de caracteres que o OCR costuma confundir (custo de troca menor)
  const CONF = new Set();
  ['09', '08', '06', '89', '17', '56', '38', '0O', '0Q', '0D', '1I', '1L', '1T', '5S', '8B', '2Z', '6G', '9G', '4A']
    .forEach(function (p) { CONF.add(p); CONF.add(p[1] + p[0]); });

  function subCost(a, b) {
    if (a === b) return 0;
    return CONF.has(a + b) ? 0.4 : 1;
  }

  // Distância de edição ponderada (inserir/remover = 1, trocar confundíveis = 0.4)
  function wdist(s, t) {
    const n = s.length, m = t.length;
    if (!n) return m;
    if (!m) return n;
    let prev = new Array(m + 1), cur = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      for (let j = 1; j <= m; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + subCost(s[i - 1], t[j - 1]));
      }
      const tmp = prev; prev = cur; cur = tmp;
    }
    return prev[m];
  }

  function lotKey(v) {
    const base = (typeof cleanLotForComparison === 'function') ? cleanLotForComparison(v) : v;
    return normCode(base);
  }

  // Variante que descarta zeros à esquerda que o OCR leu como 9, 8, O, 1...
  function lotAltKey(v) {
    let s = normCode(v);
    const m = s.match(/^[019ODQ]{3,}/);
    if (m) s = s.slice(m[0].length);
    return s;
  }

  function lotDist(readLot, stockLot) {
    const a = lotKey(readLot), b = lotKey(stockLot);
    if (!a && !b) return 0;
    if (!a || !b) return 1;
    let d = wdist(a, b);
    const a2 = lotAltKey(readLot);
    if (a2 && a2 !== a) d = Math.min(d, wdist(a2, b) + 0.3);
    return d;
  }

  // Consenso entre várias leituras: escolhe o comprimento mais frequente e vota dígito a dígito
  function consensus(reads, expectedLen) {
    const list = reads.map(normCode).filter(function (r) { return r.length >= 5; });
    if (!list.length) return '';
    const byLen = {};
    list.forEach(function (r) { (byLen[r.length] = byLen[r.length] || []).push(r); });
    let best = null;
    Object.keys(byLen).forEach(function (l) {
      const arr = byLen[l];
      const score = arr.length * 10 - Math.abs(Number(l) - expectedLen) * 0.1;
      if (!best || score > best.score) best = { len: Number(l), arr: arr, score: score };
    });
    let out = '';
    for (let i = 0; i < best.len; i++) {
      const tally = {};
      best.arr.forEach(function (r) { tally[r[i]] = (tally[r[i]] || 0) + 1; });
      out += Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
    }
    return out;
  }

  function esc(t) {
    if (typeof escapeHtml === 'function') return escapeHtml(t);
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------------------------------------------------------------------------
  // BUSCA NO SISTEMA
  // ---------------------------------------------------------------------------

  // Variantes do código lido sem 1-3 caracteres iniciais (o OCR às vezes lê "COD:" como dígitos)
  function codeVariants(rc) {
    const v = [{ s: rc, p: 0 }];
    for (let k = 1; k <= 3; k++) {
      if (rc.length - k >= 8) v.push({ s: rc.slice(k), p: 0.3 * k });
    }
    return v;
  }

  function codeDist(vars, ec) {
    let best = 99;
    for (let i = 0; i < vars.length; i++) {
      const v = vars[i];
      if (Math.abs(v.s.length - ec.length) > 3) continue;
      const d = (v.s === ec ? 0 : wdist(v.s, ec)) + v.p;
      if (d < best) best = d;
    }
    return best;
  }

  // SAÍDA: procura o código lido entre os itens que estão armazenados (rua/vaga/lote/saldo)
  function searchStock(code, lot) {
    const rc = normCode(code);
    if (!rc) return [];
    const readLot = normCode(lot);
    const stock = getAllStockItems();
    const vars = codeVariants(rc);
    const out = [];
    stock.forEach(function (e) {
      const ec = normCode(e.code);
      if (!ec) return;
      const cd = codeDist(vars, ec);
      if (cd > MAX_CODE_DIST) return;
      const ld = readLot ? lotDist(lot, e.lot) : (lotKey(e.lot) ? 1 : 0);
      out.push({
        streetId: e.streetId, streetName: e.streetName, slotCode: e.slotCode, address: e.address,
        productName: e.productName, code: e.code, description: e.description,
        lot: e.lot, quantity: e.quantity,
        codeDist: cd, lotDist: ld, lotOk: readLot ? ld <= LOT_OK_DIST : true,
        score: cd + ld * 0.6
      });
    });
    out.sort(function (a, b) { return a.score - b.score || b.quantity - a.quantity; });
    return out.slice(0, 8);
  }

  // ENTRADA: procura o código lido no catálogo de produtos
  function searchCatalog(code) {
    const rc = normCode(code);
    if (!rc) return [];
    const cat = (typeof appState !== 'undefined' && appState.catalog) ? appState.catalog : [];
    const vars = codeVariants(rc);
    const out = [];
    for (let i = 0; i < cat.length; i++) {
      const it = cat[i];
      if (!it || !it.code) continue;
      const cc = normCode(it.code);
      const d = codeDist(vars, cc);
      if (d <= MAX_CODE_DIST) out.push({ code: it.code, description: it.description || it.code, dist: d });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out.slice(0, 5);
  }

  // Onde o produto já está armazenado (ajuda a escolher o endereço na entrada)
  function existingLocations(code) {
    const rc = normCode(code);
    return getAllStockItems().filter(function (e) { return normCode(e.code) === rc; });
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
      throw new Error('Este item não está mais nesta vaga (outro usuário pode ter alterado). Leia a etiqueta novamente.');
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
  // OCR (Tesseract.js carregado sob demanda)
  // ---------------------------------------------------------------------------
  let worker = null, workerPromise = null;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = TESS_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Não foi possível carregar o leitor (OCR). Verifique a internet.')); };
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (worker) return Promise.resolve(worker);
    if (!workerPromise) {
      workerPromise = (async function () {
        await loadTesseract();
        const w = await Tesseract.createWorker('eng');
        await w.setParameters({
          tessedit_char_whitelist: OCR_CHARSET,
          tessedit_pageseg_mode: '7'
        });
        worker = w;
        return w;
      })().catch(function (e) { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  // Pré-processa o recorte: escala, tons de cinza e (stretch | otsu)
  function prepCanvas(src, variant, targetH) {
    targetH = targetH || 110;
    const scale = targetH / Math.max(1, src.height);
    const w = Math.max(10, Math.round(src.width * scale));
    const c = document.createElement('canvas');
    c.width = w + 40;
    c.height = targetH + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 20, 20, w, targetH);

    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const gray = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    }

    if (variant === 'otsu') {
      const thr = otsuThreshold(gray);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = gray[p] > thr ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    } else {
      let lo = 255, hi = 0;
      for (let p = 0; p < gray.length; p++) { if (gray[p] < lo) lo = gray[p]; if (gray[p] > hi) hi = gray[p]; }
      const range = Math.max(1, hi - lo);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = Math.max(0, Math.min(255, ((gray[p] - lo) * 255) / range));
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Recorta do vídeo exatamente a área desenhada na tela (considera object-fit: cover)
  function grabROI(video, el) {
    const vr = video.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(vr.width / vw, vr.height / vh);
    const offX = (vr.width - vw * scale) / 2;
    const offY = (vr.height - vh * scale) / 2;
    let sx = (r.left - vr.left - offX) / scale;
    let sy = (r.top - vr.top - offY) / scale;
    let sw = r.width / scale, sh = r.height / scale;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.max(8, Math.min(vw - sx, sw));
    sh = Math.max(8, Math.min(vh - sy, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw);
    c.height = Math.round(sh);
    c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }

  // ---------------------------------------------------------------------------
  // INTERFACE
  // ---------------------------------------------------------------------------
  let mode = 'SAIDA';
  let stream = null, busy = false;
  let dlg = null;
  let candidates = [];       // resultados da busca
  let selected = null;       // candidato escolhido
  let readCode = '', readLot = '';
  let lastCrops = { cod: null, lot: null };

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
            '<span class="dialog-badge" id="scan-badge">SAÍDA</span>' +
            '<h3 id="scan-title">Ler etiqueta</h3>' +
          '</div>' +
          '<button type="button" class="btn-close" id="scan-close">✕</button>' +
        '</div>' +
        '<div class="dialog-body scan-body">' +
          // ---- passo 1: câmera
          '<div id="scan-step-capture">' +
            '<div class="scan-stage">' +
              '<video id="scan-video" playsinline muted autoplay></video>' +
              '<div class="scan-box scan-box-cod" id="scan-box-cod"><span>CÓDIGO — alinhe aqui</span></div>' +
              '<button type="button" class="scan-torch hidden" id="scan-torch">🔦</button>' +
            '</div>' +
            '<p class="scan-hint">Toque ou arraste na tela para levar a faixa vermelha até os números do código (logo depois de COD:) e toque em Tirar foto. Pode mexer o celular depois do toque.</p>' +
            '<div class="scan-status" id="scan-status"></div>' +
            '<button type="button" class="btn btn-primary scan-big" id="scan-read">📷 Tirar foto e ler</button>' +
            '<div class="scan-crops hidden" id="scan-crops"></div>' +
            '<div class="scan-manual">' +
              '<div class="form-group"><label class="form-label" for="scan-code">Código lido (pode corrigir)</label>' +
              '<input type="text" id="scan-code" class="form-control scan-mono" autocomplete="off" inputmode="text"></div>' +
              '<div class="form-group"><label class="form-label" for="scan-lot">Lote (opcional — ajuda a achar o item certo)</label>' +
              '<input type="text" id="scan-lot" class="form-control scan-mono" autocomplete="off" inputmode="text"></div>' +
              '<button type="button" class="btn btn-secondary scan-big" id="scan-search">🔍 Buscar com estes dados</button>' +
            '</div>' +
          '</div>' +
          // ---- passo 2: resultado / confirmação
          '<div id="scan-step-result" class="hidden"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);

    // Toque/arraste no vídeo para posicionar a faixa vermelha sobre o código
    const stage = dlg.querySelector('.scan-stage');
    const codBox = $('scan-box-cod');
    let dragging = false;
    function moveBox(e) {
      const r = stage.getBoundingClientRect();
      const bh = codBox.offsetHeight;
      let y = (e.clientY - r.top) - bh / 2;
      y = Math.max(0, Math.min(r.height - bh, y));
      codBox.style.top = y + 'px';
    }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.scan-torch')) return;
      dragging = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      moveBox(e);
    });
    stage.addEventListener('pointermove', function (e) { if (dragging) moveBox(e); });
    stage.addEventListener('pointerup', function () { dragging = false; });
    stage.addEventListener('pointercancel', function () { dragging = false; });

    $('msb-in').addEventListener('click', function () { openScan('ENTRADA'); });
    $('msb-out').addEventListener('click', function () { openScan('SAIDA'); });
    $('scan-close').addEventListener('click', closeScan);
    $('scan-read').addEventListener('click', runScan);
    $('scan-search').addEventListener('click', function () {
      readCode = $('scan-code').value.trim();
      readLot = $('scan-lot').value.trim();
      runSearch();
    });
    dlg.addEventListener('close', stopCamera);
    dlg.addEventListener('cancel', function () { stopCamera(); });
  }

  function setStatus(text, kind) {
    const el = $('scan-status');
    el.textContent = text || '';
    el.className = 'scan-status' + (kind ? ' scan-status-' + kind : '');
  }

  async function startCamera() {
    stopCamera();
    const video = $('scan-video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('A câmera não está disponível neste navegador. Digite o código e o lote abaixo.', 'warn');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities && track.getCapabilities()) || {};
      if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
      }
      const torchBtn = $('scan-torch');
      if (caps.torch) {
        torchBtn.classList.remove('hidden');
        let on = false;
        torchBtn.onclick = function () {
          on = !on;
          track.applyConstraints({ advanced: [{ torch: on }] }).catch(function () {});
          torchBtn.classList.toggle('on', on);
        };
      } else {
        torchBtn.classList.add('hidden');
      }
      setStatus('');
    } catch (err) {
      setStatus('Não foi possível abrir a câmera. Permita o acesso à câmera no navegador ou digite os dados abaixo.', 'warn');
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    const v = $('scan-video');
    if (v) v.srcObject = null;
  }

  function showStep(step) {
    $('scan-step-capture').classList.toggle('hidden', step !== 'capture');
    $('scan-step-result').classList.toggle('hidden', step !== 'result');
  }

  function openScan(type) {
    mode = type;
    candidates = [];
    selected = null;
    readCode = '';
    readLot = '';
    lastCrops = { cod: null, lot: null };
    $('scan-badge').textContent = type === 'ENTRADA' ? 'ENTRADA' : 'SAÍDA';
    $('scan-title').textContent = type === 'ENTRADA' ? 'Entrada pela etiqueta' : 'Saída pela etiqueta';
    $('scan-code').value = '';
    $('scan-lot').value = '';
    $('scan-crops').classList.add('hidden');
    $('scan-crops').innerHTML = '';
    $('scan-box-cod').style.top = '';
    showStep('capture');
    if (!dlg.open) dlg.showModal();
    startCamera();
    // Já deixa o leitor pronto em segundo plano (primeira vez baixa ~ alguns MB)
    getWorker().catch(function () {});
  }

  function closeScan() {
    stopCamera();
    if (dlg.open) dlg.close();
  }

  async function runScan() {
    if (busy) return;
    const video = $('scan-video');
    if (!stream || !video.videoWidth) {
      setStatus('A câmera ainda não está pronta. Aguarde um instante ou digite os dados abaixo.', 'warn');
      return;
    }
    busy = true;
    const btn = $('scan-read');
    btn.disabled = true;

    // Tira a "foto" no instante do toque e congela a imagem: depois disso pode mexer o celular
    const cCod = grabROI(video, $('scan-box-cod'));
    video.pause();
    lastCrops = { cod: cCod, lot: null };
    showCrops();

    try {
      setStatus('Foto tirada ✔ Lendo o código… (a primeira vez demora um pouco)');
      const w = await getWorker();
      const reads = [];
      const heights = [90, 130];
      const variants = ['stretch', 'otsu'];
      for (let h = 0; h < heights.length; h++) {
        for (let v = 0; v < variants.length; v++) {
          const r = await w.recognize(prepCanvas(cCod, variants[v], heights[h]));
          reads.push(r.data.text);
        }
      }
      readCode = consensus(reads, EXPECTED_COD_LEN);
      readLot = $('scan-lot').value.trim();
      $('scan-code').value = readCode;
      if (!readCode) {
        setStatus('Não consegui ler o código. Toque em "Ler etiqueta" de novo ou digite abaixo.', 'warn');
        video.play().catch(function () {});
      } else {
        setStatus('');
        runSearch();
      }
    } catch (err) {
      setStatus(err.message || 'Erro na leitura. Tente novamente ou digite os dados abaixo.', 'warn');
      video.play().catch(function () {});
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  // Mostra as fotos recortadas para o operador comparar com o que foi lido
  function showCrops() {
    const box = $('scan-crops');
    box.innerHTML = '';
    [['cod', 'Código']].forEach(function (p) {
      const c = lastCrops[p[0]];
      if (!c) return;
      const wrap = document.createElement('div');
      wrap.className = 'scan-crop';
      const img = document.createElement('img');
      img.src = c.toDataURL('image/jpeg', 0.7);
      img.alt = p[1];
      const cap = document.createElement('small');
      cap.textContent = p[1] + ' (foto recortada)';
      wrap.appendChild(img);
      wrap.appendChild(cap);
      box.appendChild(wrap);
    });
    box.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // RESULTADOS & CONFIRMAÇÃO
  // ---------------------------------------------------------------------------
  function runSearch() {
    if (!normCode(readCode)) {
      setStatus('Informe o código para buscar.', 'warn');
      return;
    }
    if (mode === 'SAIDA') {
      candidates = searchStock(readCode, readLot);
    } else {
      candidates = searchCatalog(readCode);
    }
    selected = null;
    if (navigator.vibrate) navigator.vibrate(40);
    renderResult();
    showStep('result');
  }

  function errBox() { return $('scan-err'); }
  function showErr(msg) {
    const e = errBox();
    if (!e) return;
    e.textContent = '⚠️ ' + msg;
    e.classList.remove('hidden');
  }
  function hideErr() { const e = errBox(); if (e) e.classList.add('hidden'); }

  function backToCamera() {
    showStep('capture');
    if (!stream) startCamera();
    else $('scan-video').play().catch(function () {});
  }

  function renderResult(skipAuto) {
    const root = $('scan-step-result');
    const isOut = mode === 'SAIDA';
    let html = '';

    html += '<div class="scan-read-summary">' +
      '<div><small>Código lido</small><strong class="scan-mono">' + esc(readCode || '—') + '</strong></div>' +
      (readLot ? '<div><small>Lote</small><strong class="scan-mono">' + esc(readLot) + '</strong></div>' : '') +
      '</div>';

    if (!candidates.length) {
      html += '<div class="scan-empty">' + (isOut
        ? 'Nenhum item com esse código foi encontrado armazenado no sistema.'
        : 'Esse código não foi encontrado no catálogo de produtos.') + '</div>';
      if (!isOut && normCode(readCode)) {
        html += '<button type="button" class="btn btn-secondary scan-big" id="scan-use-raw">Usar o código lido mesmo assim</button>';
      }
      html += '<button type="button" class="btn btn-primary scan-big" id="scan-back">↩ Ler de novo / corrigir</button>';
      root.innerHTML = html;
      $('scan-back').addEventListener('click', backToCamera);
      const raw = $('scan-use-raw');
      if (raw) raw.addEventListener('click', function () {
        candidates = [{ code: readCode, description: readCode, dist: 0 }];
        selectCandidate(0);
      });
      return;
    }

    html += '<div class="scan-section-title">' +
      (isOut ? 'Onde está este item — toque no correto:' : 'Qual é o produto — toque no correto:') + '</div>';
    html += '<div class="scan-cands" id="scan-cands">';
    candidates.forEach(function (c, i) {
      let tags = '';
      if (isOut) {
        if (c.codeDist === 0 && c.lotOk) tags += '<span class="scan-tag ok">✔ código e lote conferem</span>';
        else {
          if (c.codeDist > 0) tags += '<span class="scan-tag warn">≈ código parecido, confira</span>';
          if (!c.lotOk) tags += '<span class="scan-tag warn">⚠ lote diferente do lido</span>';
        }
        html += '<button type="button" class="scan-cand" data-i="' + i + '">' +
          '<div class="scan-cand-desc">' + esc(c.description) + '</div>' +
          '<div class="scan-cand-meta"><span class="scan-mono">' + esc(c.code) + '</span></div>' +
          '<div class="scan-cand-addr">📍 ' + esc(c.address) + '</div>' +
          '<div class="scan-cand-meta">Lote: <b>' + esc(c.lot || 'sem lote') + '</b> · Saldo: <b>' + c.quantity + ' un</b></div>' +
          '<div>' + tags + '</div></button>';
      } else {
        tags = c.dist === 0
          ? '<span class="scan-tag ok">✔ código exato</span>'
          : '<span class="scan-tag warn">≈ código parecido, confira</span>';
        html += '<button type="button" class="scan-cand" data-i="' + i + '">' +
          '<div class="scan-cand-desc">' + esc(c.description) + '</div>' +
          '<div class="scan-cand-meta"><span class="scan-mono">' + esc(c.code) + '</span></div>' +
          '<div>' + tags + '</div></button>';
      }
    });
    html += '</div>';
    html += '<button type="button" class="btn btn-secondary scan-big" id="scan-back">↩ Ler de novo / corrigir</button>';
    root.innerHTML = html;

    $('scan-back').addEventListener('click', backToCamera);
    root.querySelectorAll('.scan-cand').forEach(function (b) {
      b.addEventListener('click', function () { selectCandidate(Number(b.dataset.i)); });
    });

    // Se só há um candidato perfeito, já abre a confirmação para ele
    const first = candidates[0];
    const second = candidates[1];
    const perfect = isOut
      ? (first.codeDist === 0 && first.lotOk && (!second || second.score > first.score))
      : (first.dist === 0 && (!second || second.dist > 0));
    if (perfect && !skipAuto) selectCandidate(0);
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

  function selectCandidate(i) {
    selected = candidates[i];
    const root = $('scan-step-result');
    const isOut = mode === 'SAIDA';
    let html = '';

    html += '<div class="scan-confirm-card ' + (isOut ? 'out' : 'in') + '">' +
      '<div class="scan-cand-desc">' + esc(selected.description) + '</div>' +
      '<div class="scan-cand-meta"><span class="scan-mono">' + esc(selected.code) + '</span></div>';

    if (isOut) {
      html += '<div class="scan-bigaddr">📍 ' + esc(selected.address) + '</div>' +
        '<div class="scan-cand-meta">Lote: <b>' + esc(selected.lot || 'sem lote') + '</b> · Saldo na vaga: <b>' + selected.quantity + ' un</b></div>';
      if (selected.codeDist > 0 || !selected.lotOk) {
        html += '<div class="scan-warnline">⚠ Confira a etiqueta: a leitura não bateu 100% com o sistema.</div>';
      }
      html += '</div>' +
        '<div class="form-group"><label class="form-label" for="scan-qty">Quantidade a dar baixa</label>' +
        '<input type="number" id="scan-qty" class="form-control scan-qty" inputmode="numeric" min="1" max="' + selected.quantity + '" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label" for="scan-doc">Solicitação / NF / motivo</label>' +
        '<input type="text" id="scan-doc" class="form-control" value="' + DEFAULT_DOC_OUT + '"></div>';
    } else {
      const loc = existingLocations(selected.code).slice(0, 3);
      if (loc.length) {
        html += '<div class="scan-cand-meta">Já armazenado em: ' + loc.map(function (e) {
          return '<b>' + esc(e.address) + '</b> (lote ' + esc(e.lot || '—') + ', ' + e.quantity + ' un)';
        }).join('; ') + '</div>';
      }
      html += '</div>';

      // sugestão: lote lido parecido com lote já existente do produto
      let lotChip = '';
      const known = existingLocations(selected.code);
      for (let k = 0; k < known.length; k++) {
        if (known[k].lot && normCode(readLot) && lotDist(readLot, known[k].lot) <= LOT_OK_DIST && lotKey(readLot) !== lotKey(known[k].lot)) {
          lotChip = '<button type="button" class="scan-chip" id="scan-lot-suggest" data-lot="' + esc(known[k].lot) + '">Parece o lote ' + esc(known[k].lot) + ' — usar</button>';
          break;
        }
      }

      html += '<div class="form-group"><label class="form-label" for="scan-in-lot">Lote (digite)</label>' +
        '<input type="text" id="scan-in-lot" class="form-control scan-mono scan-lotbig" value="' + esc(readLot) + '" placeholder="Digite o lote" autocomplete="off">' + lotChip + '</div>' +
        '<div class="form-group"><label class="form-label" for="scan-in-street">Rua</label>' +
        '<select id="scan-in-street" class="form-control">' + streetOptionsHtml(appState.activeStreetId) + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="scan-in-slot">Vaga</label>' +
        '<select id="scan-in-slot" class="form-control"></select></div>' +
        '<div class="form-group"><label class="form-label" for="scan-qty">Quantidade</label>' +
        '<input type="number" id="scan-qty" class="form-control scan-qty" inputmode="numeric" min="1" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label" for="scan-doc">Solicitação / NF / motivo</label>' +
        '<input type="text" id="scan-doc" class="form-control" value="' + DEFAULT_DOC_IN + '"></div>';
    }

    html += '<div id="scan-err" class="alert-banner alert-danger hidden"></div>' +
      '<button type="button" class="btn ' + (isOut ? 'btn-danger' : 'btn-success') + ' scan-big" id="scan-confirm">' +
      (isOut ? '✅ Confirmar baixa' : '✅ Confirmar entrada') + '</button>' +
      '<button type="button" class="btn btn-secondary scan-big" id="scan-back2">↩ Voltar</button>';

    root.innerHTML = html;

    $('scan-back2').addEventListener('click', function () { renderResult(true); });
    $('scan-confirm').addEventListener('click', confirmAction);

    if (!isOut) {
      const stSel = $('scan-in-street');
      const slSel = $('scan-in-slot');
      const fill = function () { slSel.innerHTML = slotOptionsHtml(stSel.value); };
      stSel.addEventListener('change', fill);
      fill();
      const chip = $('scan-lot-suggest');
      if (chip) chip.addEventListener('click', function () { $('scan-in-lot').value = chip.dataset.lot; });
    }
    setTimeout(function () {
      const lotEl = !isOut ? $('scan-in-lot') : null;
      const q = (lotEl && !lotEl.value) ? lotEl : $('scan-qty');
      if (q) q.focus();
    }, 80);
  }

  function confirmAction() {
    hideErr();
    const qty = parseInt($('scan-qty').value, 10);
    const doc = $('scan-doc').value.trim();
    if (isNaN(qty) || qty <= 0) { showErr('Por favor, informe uma quantidade válida maior que zero.'); return; }
    if (!doc) { showErr('Informe o número da Solicitação, NF ou motivo para auditoria.'); return; }

    try {
      if (mode === 'SAIDA') {
        execSaida(selected, qty, doc);
      } else {
        const lot = $('scan-in-lot').value.trim();
        execEntrada(selected, $('scan-in-street').value, $('scan-in-slot').value, qty, lot, doc);
      }
    } catch (err) {
      showErr(err.message || 'Não foi possível registrar.');
      return;
    }
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    closeScan();
    toast(mode === 'SAIDA' ? 'Baixa registrada ✔' : 'Entrada registrada ✔');
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
  // Exposto para testes
  window.__scanMobile = {
    wdist: wdist, consensus: consensus, lotDist: lotDist,
    searchStock: searchStock, searchCatalog: searchCatalog, normCode: normCode
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', buildUI);
  }
})();
