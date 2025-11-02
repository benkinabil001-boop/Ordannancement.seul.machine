/* ============================================================
   script.js — Smart Scheduler (machine unique)
   - Prédecesseurs (contraintes simples)
   - Axe temporel sous le Gantt
   - Sélection & dé-duplication des méthodes
   - Objectifs: Minimiser Cmax or Minimiser retard total
   - Indices et IA affichés automatiquement après calcul
   - Export PDF (html2canvas + jsPDF)
   ============================================================ */

(() => {
  // ---------- données globales ----------
  let tasks = []; // { name, dur, due, hasPred(bool), predName }
  let lastMetrics = []; // [{method, metrics}, ...]

  // ---------- utilitaires ----------
  const el = id => document.getElementById(id);
  const q = sel => document.querySelector(sel);

  function uid() { return Math.random().toString(36).slice(2,9); }

  // ---------- REFRESH TABLE ----------
  function refreshTable() {
    const tbody = el('tasksTable').querySelector('tbody');
    tbody.innerHTML = '';
    tasks.forEach((t, i) => {
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${t.name}</td>
          <td>${t.dur}</td>
          <td>${t.due !== null && t.due !== undefined ? t.due : '-'}</td>
          <td>${t.hasPred ? (t.predName || '-') : '-'}</td>
          <td>
            <button class="ghost" onclick="window.__ss_delete(${i})">Suppr</button>
          </td>
        </tr>
      `);
    });
  }

  // expose a delete wrapper so button inline onclick works
  window.__ss_delete = function(i) {
    tasks.splice(i,1);
    refreshTable();
    clearResults();
    autoRecomputeIfNeeded();
  };

  function clearResults() {
    el('resultContainer').innerHTML = '';
    el('ganttArea').innerHTML = '';
    el('timeAxis').innerHTML = '';
    el('indicesContainer').innerHTML = '';
    el('aiThinker').innerHTML = '';
    lastMetrics = [];
  }

  // ---------- selected methods from UI (dedupe) ----------
  function selectedMethodsFromUI() {
    const mapping = {
      method_fifo: 'FIFO',
      method_spt: 'SPT',
      method_lpt: 'LPT',
      method_dp: 'DP',
      method_rc: 'RC'
    };
    const methods = [];
    Object.keys(mapping).forEach(id => {
      const cb = el(id);
      if (cb && cb.checked) methods.push(mapping[id]);
    });
    // dedupe and keep order as in list
    const order = ['FIFO','SPT','LPT','DP','RC'];
    return order.filter(m => methods.includes(m));
  }

  // ---------- objective from UI ----------
  function getObjectiveFromUI() {
    const sel = document.querySelector('input[name="objective"]:checked');
    return sel ? sel.value : 'Cmax';
  }

  // ---------- compute sequence helpers ----------
  // deep copy small
  function cloneTasks(arr) {
    return arr.map(t => ({...t}));
  }

  function computeSequence(method, tasksList) {
    // returns an array (order) of tasks objects, but does not compute start/end here
    const seq = cloneTasks(tasksList);
    switch (method) {
      case 'SPT': seq.sort((a,b) => a.dur - b.dur); break;
      case 'LPT': seq.sort((a,b) => b.dur - a.dur); break;
      case 'DP': seq.sort((a,b) => (a.due ?? Infinity) - (b.due ?? Infinity)); break;
      case 'RC': seq.sort((a,b) => ((a.due ?? Infinity)/a.dur) - ((b.due ?? Infinity)/b.dur)); break;
      default: /*FIFO*/ break;
    }
    return seq;
  }

  // Evaluate sequence taking into account precedence constraints:
  // For each task in the sequence, its start is max(machineAvailable, predecessorEnd)
  // machineAvailable moves forward by task durations (single machine).
  function evaluateSequenceWithPrecedence(seq) {
    const rows = [];
    let machineAvailable = 0;
    // we may need quick lookup for ends by name as we compute
    const endByName = {};
    // iterate in given order but ensure predecessor constraint by delaying start when needed
    seq.forEach(task => {
      const predName = (task.hasPred && task.predName) ? String(task.predName).trim() : null;
      const predEnd = predName ? (endByName[predName] ?? 0) : 0;
      const start = Math.max(machineAvailable, predEnd);
      const end = start + task.dur;
      const late = (task.due !== null && task.due !== undefined) ? Math.max(0, end - task.due) : 0;
      rows.push({...task, start, end, late});
      endByName[task.name] = end;
      machineAvailable = end;
    });
    // metrics
    const makespan = rows.length ? rows[rows.length-1].end : 0;
    const n = seq.length || 1;
    const avgCompletion = rows.reduce((s,r)=>s+r.end,0) / n;
    const totalLate = rows.reduce((s,r)=>s+r.late,0);
    const avgLate = totalLate / n;
    return { rows, makespan, avgCompletion, totalLate, avgLate };
  }

  // ---------- render single method block (table + gantt fragment) ----------
  function renderMethodBlock(method, tasksList) {
    const seq = computeSequence(method, tasksList);
    const metrics = evaluateSequenceWithPrecedence(seq);

    // Build HTML for table
    let html = `
      <h3 style="text-align:center;margin-top:12px;color:var(--primary);">Méthode ${method}</h3>
      <div class="table-wrap">
        <table class="calc-table">
          <thead><tr><th>Tâche</th><th>Durée</th><th>Début</th><th>Fin</th><th>Date promise</th><th>Retard</th></tr></thead>
          <tbody>`;
    metrics.rows.forEach(r => {
      html += `<tr><td>${r.name}</td><td>${r.dur}</td><td>${r.start}</td><td>${r.end}</td><td>${r.due ?? '-'}</td><td>${r.late}</td></tr>`;
    });
    html += `</tbody></table></div>`;

    return { html, metrics };
  }

  // ---------- render overall results and Gantt ----------
  function renderResultsForMethods(methods) {
    if (!methods.length) {
      alert('Sélectionnez au moins une méthode à calculer.');
      return;
    }
    if (!tasks.length) {
      alert('Ajoutez des tâches avant de calculer.');
      return;
    }

    clearResults();

    // compute each method metrics and accumulate html
    let outHtml = '';
    const metricsList = [];
    methods.forEach(m => {
      const blk = renderMethodBlock(m, tasks);
      outHtml += blk.html;
      metricsList.push({ method: m, metrics: blk.metrics });
    });

    el('resultContainer').innerHTML = outHtml;
    lastMetrics = metricsList;

    // build combined Gantt: choose first method to visualize by default, and show grouped bars per method
    // For clarity we will display Gantt for each method stacked (method header + its bars)
    const ganttArea = el('ganttArea');
    ganttArea.innerHTML = '';
    let globalMax = 0;
    metricsList.forEach(item => {
      globalMax = Math.max(globalMax, item.metrics.makespan);
    });
    if (globalMax === 0) globalMax = 1;

    metricsList.forEach(item => {
      const m = item.method;
      const metrics = item.metrics;
      // section title
      const section = document.createElement('div');
      section.innerHTML = `<h4 style="color:var(--primary-dark);margin:8px 0">${m}</h4>`;
      // rows
      metrics.rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'task-row';
        // label
        const label = document.createElement('div');
        label.className = 'task-label';
        label.textContent = r.name;
        // bar container
        const container = document.createElement('div');
        container.className = 'task-bar-container';
        // bar
        const bar = document.createElement('div');
        bar.className = 'task-bar';
        // compute percent left and width based on globalMax to align axes across methods
        const left = (r.start / globalMax) * 100;
        const width = (r.dur / globalMax) * 100;
        bar.style.left = `${left}%`;
        bar.style.width = `${width}%`;
        bar.style.background = 'linear-gradient(90deg, #ff8c00, #ffb86b)';
        bar.textContent = r.dur;
        // append
        container.appendChild(bar);
        row.appendChild(label);
        row.appendChild(container);
        section.appendChild(row);
      });
      ganttArea.appendChild(section);
    });

    // Render time axis (0..globalMax with integer ticks)
    renderTimeAxis(Math.ceil(globalMax));

    // Render indices automatically
    renderIndices(lastMetrics);

    // Run IA analysis automatically
    thinkerAuto();

  }

  // ---------- render time axis ----------
  function renderTimeAxis(maxT) {
    const axis = el('timeAxis');
    axis.innerHTML = '';
    if (maxT <= 0) return;
    // create ticks 0..maxT
    // we'll show up to 20 ticks; if maxT > 20 show every step of ceil(maxT/20)
    const maxTicks = 20;
    let step = 1;
    if (maxT > maxTicks) step = Math.ceil(maxT / maxTicks);
    for (let t = 0; t <= maxT; t += step) {
      const span = document.createElement('span');
      span.textContent = t;
      axis.appendChild(span);
    }
  }

  // ---------- indices table ----------
  function renderIndices(metricsList) {
    if (!metricsList || !metricsList.length) return;
    let html = `<h3 style="text-align:center;margin-top:10px;color:var(--primary);">📊 Indices de performance</h3>`;
    html += `<div class="table-wrap"><table class="indices-table"><thead>
      <tr><th>Méthode</th><th>Temps total (Cmax)</th><th>Temps moyen (compl.)</th><th>Retard total</th><th>Retard moyen</th></tr></thead><tbody>`;
    metricsList.forEach(it => {
      const m = it.metrics;
      html += `<tr>
        <td>${it.method}</td>
        <td>${m.makespan.toFixed(2)}</td>
        <td>${m.avgCompletion.toFixed(2)}</td>
        <td>${m.totalLate.toFixed(2)}</td>
        <td>${m.avgLate.toFixed(2)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el('indicesContainer').innerHTML = html;
  }

  // ---------- IA thinker (auto) ----------
  function thinkerAuto() {
    if (!lastMetrics || !lastMetrics.length) {
      el('aiThinker').innerHTML = `<p style="color:#b91c1c">Aucun résultat calculé pour l'analyse IA.</p>`;
      return;
    }
    const objective = getObjectiveFromUI();
    // choose best according to objective
    let best = lastMetrics[0];
    if (objective === 'Cmax') {
      best = lastMetrics.reduce((a,b) => a.metrics.makespan <= b.metrics.makespan ? a : b);
    } else {
      best = lastMetrics.reduce((a,b) => a.metrics.totalLate <= b.metrics.totalLate ? a : b);
    }

    // also choose method minimizing avgCompletion and minimizing totalLate separately for explanation
    const bestAvg = lastMetrics.reduce((a,b) => a.metrics.avgCompletion <= b.metrics.avgCompletion ? a : b);
    const bestLate = lastMetrics.reduce((a,b) => a.metrics.totalLate <= b.metrics.totalLate ? a : b);

    // Formulate recommendation text carefully (avoid duplicate statements)
    const parts = [];
    parts.push(`<h3>🤖 Analyse IA automatique</h3>`);
    parts.push(`<p>Objectif d'optimisation : <strong>${objective}</strong></p>`);
    parts.push(`<p>Recommandation principale : utilisez la méthode <strong style="color:var(--primary-dark)">${best.method}</strong>.</p>`);

    // explain tradeoffs
    if (bestAvg.method !== bestLate.method) {
      parts.push(`<ul>
        <li>⏱️ <strong>${bestAvg.method}</strong> minimise le temps moyen de complétion.</li>
        <li>📦 <strong>${bestLate.method}</strong> minimise le retard total.</li>
      </ul>`);
      parts.push(`<p>💡 Si vous cherchez un bon compromis, choisissez la méthode qui limite l'indicateur prioritaire selon l'objectif.</p>`);
    } else {
      parts.push(`<p>✅ Les analyses montrent que <strong>${bestAvg.method}</strong> est solide sur plusieurs critères (temps moyen et retard).</p>`);
    }

    // If user selected only one method, avoid redundant wording
    const selected = selectedMethodsFromUI();
    if (selected.length === 1) {
      parts.push(`<p>Note : Vous avez choisi uniquement <strong>${selected[0]}</strong> comme méthode — les résultats s'appuient sur ce choix.</p>`);
    }

    // show short numeric summary of best method
    parts.push(`<p style="margin-top:8px;color:#6b7280">Résumé : Cmax = ${best.metrics.makespan.toFixed(2)}, Retard total = ${best.metrics.totalLate.toFixed(2)}</p>`);

    el('aiThinker').innerHTML = parts.join('');
  }

  // ---------- main action: compute based on selected methods ----------
  el('allBtn').addEventListener('click', () => {
    const methods = selectedMethodsFromUI();
    // avoid duplicates already handled by selectedMethodsFromUI
    renderResultsForMethods(methods);
  });

  // ---------- auto recompute when objective or method checkboxes change ----------
  const methodIds = ['method_fifo','method_spt','method_lpt','method_dp','method_rc'];
  methodIds.forEach(id => {
    const cb = el(id);
    if (!cb) return;
    cb.addEventListener('change', () => {
      clearResults();
      autoRecomputeIfNeeded();
    });
  });
  document.querySelectorAll('input[name="objective"]').forEach(r => {
    r.addEventListener('change', () => {
      // if results shown, recompute to reflect objective-based IA (metrics don't change, but IA suggestion may)
      if (lastMetrics.length) thinkerAuto();
    });
  });

  function autoRecomputeIfNeeded() {
    // If last tasks changed and there are selected methods and tasks exist, optionally compute automatically
    // To avoid too many auto-runs, we will not auto-run heavy compute; only trigger if user previously computed
    // For now we do nothing; user clicks 'Calculer sélection' to compute.
  }

  // ---------- Add task handler ----------
  el('addBtn').addEventListener('click', () => {
    const name = (el('name').value || '').trim() || `T${tasks.length+1}`;
    const dur = parseInt(el('dur').value, 10);
    const dueRaw = el('due').value;
    const due = dueRaw === '' ? null : parseInt(dueRaw, 10);
    const hasPred = !!el('hasPred').checked;
    const predName = (el('predName').value || '').trim() || null;

    if (!dur || dur <= 0) return alert('Entrer une durée valide (>0).');
    if (hasPred && !predName) {
      if (!confirm('Vous avez coché "A un prédécesseur" mais le nom est vide. Continuer sans prédécesseur ?')) {
        return;
      }
    }

    // name must be unique: if exists append suffix
    let finalName = name;
    const existingNames = tasks.map(t=>t.name);
    let k = 1;
    while (existingNames.includes(finalName)) {
      finalName = `${name}_${k++}`;
    }

    tasks.push({ name: finalName, dur, due, hasPred: !!hasPred, predName: predName || null });
    refreshTable();
    clearResults();
    // optional: if user wants quick calculation every add, you could call renderResultsForMethods here
  });

  // ---------- clear all ----------
  el('clearBtn').addEventListener('click', () => {
    if (!confirm('Effacer toutes les tâches ?')) return;
    tasks = [];
    refreshTable();
    clearResults();
  });

  // ---------- example dataset (button) ----------
  el('exampleBtn')?.addEventListener('click', () => {
    tasks = [
      { name:'A', dur:4, due:10, hasPred:false, predName:null },
      { name:'B', dur:7, due:15, hasPred:false, predName:null },
      { name:'C', dur:3, due:9, hasPred:false, predName:null },
      { name:'D', dur:5, due:20, hasPred:true, predName:'B' }, // D depends on B
    ];
    refreshTable();
    clearResults();
  });

  // ---------- export PDF ----------
  el('exportPDF').addEventListener('click', async () => {
    const rc = el('resultContainer');
    if (!rc.innerHTML.trim()) return alert('Aucun résultat à exporter. Cliquez "Calculer sélection" d\'abord.');
    try {
      const pdf = new window.jspdf.jsPDF('p','mm','a4');
      const canvas = await html2canvas(rc, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      const width = 190;
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(img, 'PNG', 10, 10, width, height);

      const ai = el('aiThinker');
      if (ai && ai.innerHTML.trim()) {
        pdf.addPage();
        const canvas2 = await html2canvas(ai, { scale: 2 });
        const img2 = canvas2.toDataURL('image/png');
        const h2 = (canvas2.height * width) / canvas2.width;
        pdf.addImage(img2, 'PNG', 10, 10, width, h2);
      }
      pdf.save('Ordonnancement_Resultats.pdf');
      alert('PDF généré.');
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la génération du PDF.');
    }
  });

  // ---------- import PDF handler placeholder ----------
  el('importPdfInput')?.addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    alert('Import PDF sélectionné : ' + f.name + '\n( Fonction d\'analyse PDF non implémentée ici )');
    // If you want, we can add a PDF parsing step later.
  });

  // ---------- initial sample tasks (optional) ----------
  tasks = [
    { name:'A', dur:4, due:10, hasPred:false, predName:null },
    { name:'B', dur:7, due:15, hasPred:false, predName:null },
    { name:'C', dur:3, due:9, hasPred:false, predName:null }
  ];
  refreshTable();

  // ---------- Auto-display: if page loads with tasks and checkboxes selected, you may call a compute
  // Not auto-run to give user control. Uncomment if you want an immediate calculation:
  // renderResultsForMethods(selectedMethodsFromUI());

  // ---------- Expose small API for debugging from console ----------
  window.__ss = {
    tasks,
    refreshTable,
    renderResultsForMethods,
    selectedMethodsFromUI,
    getObjectiveFromUI
  };

})();
