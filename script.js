/* ======================================================
   SCRIPT FINAL - SMART SCHEDULER IA
   Compatible Render.com | Par Nabil Benkirane
   ====================================================== */

let tasks = [];
let lastMetrics = [];

/* =============== GESTION DU TABLEAU DE TÂCHES =============== */
function refreshTable() {
  const tbody = document.querySelector("#tasksTable tbody");
  tbody.innerHTML = "";
  tasks.forEach((t, i) => {
    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr>
        <td>${t.name}</td>
        <td>${t.dur}</td>
        <td>${t.due ?? "-"}</td>
        <td><button style="background:#e74c3c;color:white;padding:5px;border:none;border-radius:5px" onclick="deleteTask(${i})">X</button></td>
      </tr>`
    );
  });
}

function deleteTask(i) {
  tasks.splice(i, 1);
  refreshTable();
  clearResults();
}

document.getElementById("addBtn").addEventListener("click", () => {
  const name = document.getElementById("name").value.trim() || `T${tasks.length + 1}`;
  const dur = parseInt(document.getElementById("dur").value);
  const dueVal = document.getElementById("due").value;
  const due = dueVal === "" ? null : parseInt(dueVal);
  if (!dur || dur <= 0) return alert("⚠️ Entrez une durée valide.");
  tasks.push({ name, dur, due });
  refreshTable();
});

document.getElementById("clearBtn").addEventListener("click", () => {
  tasks = [];
  refreshTable();
  clearResults();
});

/* =============== UTILITAIRES =============== */
function clearResults() {
  document.getElementById("resultContainer").innerHTML = "";
  document.getElementById("indicesContainer").innerHTML = "";
  document.getElementById("aiThinker").innerHTML = "";
  lastMetrics = [];
}

/* =============== ALGORITHMES D’ORDONNANCEMENT =============== */
function computeSequence(method) {
  const seq = [...tasks];
  if (method === "SPT") seq.sort((a, b) => a.dur - b.dur);
  if (method === "LPT") seq.sort((a, b) => b.dur - a.dur);
  if (method === "DP")
    seq.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  if (method === "RC")
    seq.sort(
      (a, b) =>
        ((a.due ?? Infinity) / a.dur) - ((b.due ?? Infinity) / b.dur)
    );
  return seq;
}

/* =============== CALCUL DES MÉTRIQUES =============== */
function evaluateSequence(seq) {
  let t = 0;
  const rows = [];
  let totalLate = 0;

  seq.forEach((task) => {
    const start = t;
    const end = start + task.dur;
    const late = task.due ? Math.max(0, end - task.due) : 0;
    rows.push({ ...task, start, end, late });
    t = end;
    totalLate += late;
  });

  const makespan = t;
  const n = seq.length || 1;
  const avgCompletion = rows.reduce((a, b) => a + b.end, 0) / n;
  const avgNumber = makespan > 0 ? (n / makespan) * avgCompletion : 0;
  const avgLate = totalLate / n;

  return { rows, makespan, avgCompletion, avgNumber, totalLate, avgLate };
}

/* =============== AFFICHAGE TABLEAU + GANTT =============== */
function renderMethodBlock(method) {
  const seq = computeSequence(method);
  const metrics = evaluateSequence(seq);

  // stocker les métriques
  const idx = lastMetrics.findIndex((x) => x.method === method);
  if (idx >= 0) lastMetrics[idx] = { method, metrics };
  else lastMetrics.push({ method, metrics });

  let html = `<div class="calc-title">Tableau - ${method}</div>
  <table class="calc-table">
    <thead>
      <tr><th>Tâche</th><th>Durée</th><th>Début</th><th>Fin</th><th>Date Promise</th><th>Retard</th></tr>
    </thead><tbody>`;

  metrics.rows.forEach((r) => {
    html += `<tr>
      <td>${r.name}</td>
      <td>${r.dur}</td>
      <td>${r.start}</td>
      <td>${r.end}</td>
      <td>${r.due ?? "-"}</td>
      <td>${r.late}</td>
    </tr>`;
  });
  html += `</tbody></table>`;

  // Gantt
  const total = Math.max(1, metrics.makespan);
  html += `<div class="gantt-title">GANTT ${method}</div><div class="gantt-chart">`;
  metrics.rows.forEach((r) => {
    const left = (r.start / total) * 100;
    const width = (r.dur / total) * 100;
    html += `
      <div class="task-row">
        <div class="task-label">${r.name}</div>
        <div class="task-bar-container">
          <div class="task-bar" style="left:${left}%;width:${width}%;">${r.dur}</div>
        </div>
      </div>`;
  });
  html += `</div>`;
  return { html, metrics };
}

/* =============== BOUTONS MÉTHODES =============== */
["fifo", "spt", "lpt", "dp", "rc"].forEach((m) => {
  document.getElementById(`${m}Btn`).addEventListener("click", () => {
    clearResults();
    const blk = renderMethodBlock(m.toUpperCase());
    document.getElementById("resultContainer").innerHTML = blk.html;
  });
});

/* =============== TOUT CALCULER =============== */
document.getElementById("allBtn").addEventListener("click", () => {
  if (!tasks.length) return alert("Ajoute des tâches avant de calculer.");
  clearResults();
  const methods = ["FIFO", "SPT", "LPT", "DP", "RC"];
  let out = "";
  methods.forEach((m) => (out += renderMethodBlock(m).html));
  document.getElementById("resultContainer").innerHTML = out;
});

/* =============== INDICES DE PERFORMANCE =============== */
document.getElementById("indicesBtn").addEventListener("click", () => {
  if (!tasks.length) return alert("Ajoute des tâches d'abord.");
  if (lastMetrics.length === 0) {
    const methods = ["FIFO", "SPT", "LPT", "DP", "RC"];
    lastMetrics = methods.map((m) => ({
      method: m,
      metrics: evaluateSequence(computeSequence(m)),
    }));
  }

  let html = `<h3 style="text-align:center;color:#0b5f8a;margin-top:14px;">Tableau des Indices de Performance</h3>`;
  html += `<table class="indices-table"><thead><tr><th>Méthode</th><th>Temps total</th><th>Temps moyen</th><th>Nombre moyen</th><th>Retard total</th><th>Retard moyen</th></tr></thead><tbody>`;
  lastMetrics.forEach((item) => {
    const m = item.metrics;
    html += `<tr>
      <td>${item.method}</td>
      <td>${m.makespan.toFixed(2)}</td>
      <td>${m.avgCompletion.toFixed(2)}</td>
      <td>${m.avgNumber.toFixed(2)}</td>
      <td>${m.totalLate.toFixed(2)}</td>
      <td>${m.avgLate.toFixed(2)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("indicesContainer").innerHTML = html;
});

/* =============== IA THINKER (locale) =============== */
function thinker() {
  if (!lastMetrics.length) {
    document.getElementById("aiThinker").innerHTML =
      "<p>⚠️ Calculez les indices avant d'activer l'analyse IA.</p>";
    return;
  }

  const bestLate = lastMetrics.reduce((a, b) =>
    a.metrics.totalLate < b.metrics.totalLate ? a : b
  );
  const bestAvg = lastMetrics.reduce((a, b) =>
    a.metrics.avgCompletion < b.metrics.avgCompletion ? a : b
  );

  const diffLate = Math.abs(
    bestLate.metrics.totalLate - bestAvg.metrics.totalLate
  ).toFixed(2);
  const diffTime = Math.abs(
    bestLate.metrics.avgCompletion - bestAvg.metrics.avgCompletion
  ).toFixed(2);

  const message = `
    <h3>🤖 IA Analyse & Raisonnement</h3>
    <p>J'ai observé les performances calculées pour chaque stratégie.</p>
    <ul>
      <li>🔹 <strong>${bestAvg.method}</strong> donne le <strong>temps moyen le plus faible</strong> (${bestAvg.metrics.avgCompletion.toFixed(2)}).</li>
      <li>🔹 <strong>${bestLate.method}</strong> minimise le <strong>retard total</strong> (${bestLate.metrics.totalLate.toFixed(2)}).</li>
    </ul>
    <p><strong>Analyse :</strong></p>
    <ul>
      <li>⚙️ Pour un flux rapide → <strong>${bestAvg.method}</strong></li>
      <li>📦 Pour respecter les délais → <strong>${bestLate.method}</strong></li>
    </ul>
    <p>Écart observé : Δ temps moyen = ${diffTime}, Δ retard = ${diffLate}</p>
    <p>💡 Recommandation : Combiner ${bestAvg.method} au début et ${bestLate.method} en fin de cycle pour une meilleure efficacité.</p>
  `;
  document.getElementById("aiThinker").innerHTML = message;
}
document.getElementById("thinkIA").addEventListener("click", thinker);

/* =============== EXPORT PDF MULTI-PAGES (Render Ready) =============== */
document.getElementById("exportPDF").addEventListener("click", async () => {
  const resultContainer = document.getElementById("resultContainer");
  const indicesContainer = document.getElementById("indicesContainer");
  const aiBox = document.getElementById("aiThinker");

  if (!resultContainer.innerHTML.trim())
    return alert("⚠️ Aucun résultat à exporter — clique 'Tout calculer' d'abord.");

  const pdf = new window.jspdf.jsPDF("p", "mm", "a4");
  const imgWidth = 190;

  // Page 1 — tableaux + Gantt
  const canvas1 = await html2canvas(resultContainer, { scale: 2 });
  const img1 = canvas1.toDataURL("image/png");
  const imgHeight1 = (canvas1.height * imgWidth) / canvas1.width;
  pdf.addImage(img1, "PNG", 10, 10, imgWidth, imgHeight1);

  // Page 2 — indices + IA
  pdf.addPage();
  const canvas2 = await html2canvas(indicesContainer, { scale: 2 });
  const img2 = canvas2.toDataURL("image/png");
  const imgHeight2 = (canvas2.height * imgWidth) / canvas2.width;
  pdf.addImage(img2, "PNG", 10, 10, imgWidth, imgHeight2);

  if (aiBox.innerHTML.trim()) {
    const canvas3 = await html2canvas(aiBox, { scale: 2 });
    const img3 = canvas3.toDataURL("image/png");
    const imgHeight3 = (canvas3.height * imgWidth) / canvas3.width;
    pdf.addImage(img3, "PNG", 10, 20 + imgHeight2, imgWidth, imgHeight3);
  }

  pdf.save("Ordonnancement_IA_Complet.pdf");
  alert("✅ PDF exporté avec succès (2 pages).");
});

/* =============== DONNÉES INITIALES (EXEMPLE) =============== */
tasks = [
  { name: "A", dur: 5, due: 12 },
  { name: "B", dur: 7, due: 16 },
  { name: "C", dur: 3, due: 9 },
  { name: "D", dur: 8, due: 18 },
  { name: "E", dur: 5, due: 14 },
  { name: "F", dur: 10, due: 20 },
];
refreshTable();
