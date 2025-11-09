/* ============================================================
   Smart Scheduler IA (Final Version)
   - Respect des précédences
   - Conversion unités de saisie / unité globale
   - Axe temporel clair sous chaque Gantt
   - IA automatique + Export PDF
   ============================================================ */

(() => {
  let tasks = [];
  let lastMetrics = [];

  const el = id => document.getElementById(id);
  const q = sel => document.querySelector(sel);

  // ----- Définition des unités -----
  function unitInfo(unit) {
    return {
      hours: { label: "h", factor: 1 },
      days: { label: "j", factor: 24 },
      weeks: { label: "sem", factor: 24 * 7 },
      months: { label: "mois", factor: 24 * 30 },
    }[unit || "hours"];
  }

  // ----- Rafraîchit la table -----
  function refreshTable() {
    const tbody = el("tasksTable").querySelector("tbody");
    tbody.innerHTML = "";
    tasks.forEach((t, i) => {
      tbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td>${t.name}</td>
          <td>${t.inputDur}</td>
          <td>${unitInfo(t.inputUnit).label}</td>
          <td>${t.due ?? "-"}</td>
          <td>${t.hasPred ? t.predName || "-" : "-"}</td>
          <td><button class="ghost" onclick="window.__del(${i})">X</button></td>
        </tr>`
      );
    });
  }

  window.__del = i => {
    tasks.splice(i, 1);
    refreshTable();
    clearResults();
  };

  function clearResults() {
    el("resultContainer").innerHTML = "";
    el("ganttArea").innerHTML = "";
    el("indicesContainer").innerHTML = "";
    el("aiThinker").innerHTML = "";
    lastMetrics = [];
  }

  // ----- Méthodes -----
  function selectedMethods() {
    const ids = {
      method_fifo: "FIFO",
      method_spt: "SPT",
      method_lpt: "LPT",
      method_dp: "DP",
      method_rc: "RC",
    };
    return Object.keys(ids)
      .filter(id => el(id)?.checked)
      .map(id => ids[id]);
  }

  function getObjective() {
    return document.querySelector('input[name="objective"]:checked')?.value || "Cmax";
  }

  // ----- Séquence -----
  function computeSequence(method, list) {
    const seq = list.map(t => ({ ...t }));
    switch (method) {
      case "SPT":
        seq.sort((a, b) => a.dur - b.dur);
        break;
      case "LPT":
        seq.sort((a, b) => b.dur - a.dur);
        break;
      case "DP":
        seq.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
        break;
      case "RC":
        seq.sort(
          (a, b) =>
            ((a.due ?? Infinity) / a.dur) - ((b.due ?? Infinity) / b.dur)
        );
        break;
      default:
        break;
    }
    return seq;
  }

  // ----- Évaluation -----
  function evaluate(seq) {
    const rows = [];
    let machineTime = 0;
    const endByName = {};

    seq.forEach(t => {
      const predEnd = t.hasPred && t.predName ? endByName[t.predName] ?? 0 : 0;
      const start = Math.max(machineTime, predEnd);
      const end = start + t.dur;
      const late = t.due ? Math.max(0, end - t.due) : 0;

      rows.push({ ...t, start, end, late });
      endByName[t.name] = end;
      machineTime = end;
    });

    const makespan = machineTime;
    const totalLate = rows.reduce((s, r) => s + r.late, 0);
    const avg = rows.reduce((s, r) => s + r.end, 0) / rows.length;
    return { rows, makespan, totalLate, avg };
  }

  // ----- Rendu principal -----
  function renderResults() {
    const methods = selectedMethods();
    if (!tasks.length) return alert("Ajoutez des tâches !");
    if (!methods.length) return alert("Choisissez au moins une méthode !");

    clearResults();
    lastMetrics = [];

    const useRealDates = el("useRealDates").checked;
    const startDate = el("startDate").value ? new Date(el("startDate").value) : null;
    const globalUnit = unitInfo(el("timeUnit").value);

    const ganttArea = el("ganttArea");
    const resContainer = el("resultContainer");

    // Calcule toutes les méthodes
    const all = methods.map(m => ({
      method: m,
      metrics: evaluate(computeSequence(m, tasks)),
    }));

    lastMetrics = all;
    let globalMax = Math.max(...all.map(a => a.metrics.makespan), 1);
    globalMax = Math.ceil(globalMax);

    let html = "";
    all.forEach(it => {
      const { method, metrics } = it;
      html += `
        <h3 style="text-align:center;color:#004aad;">Méthode ${method}</h3>
        <div class="table-wrap">
          <table class="calc-table">
            <thead><tr><th>Tâche</th><th>Durée (${globalUnit.label})</th><th>Début</th><th>Fin</th><th>Date promise</th><th>Retard</th></tr></thead>
            <tbody>${metrics.rows
              .map(
                r => `<tr>
                      <td>${r.name}</td>
                      <td>${r.dur}</td>
                      <td>${r.start}</td>
                      <td>${r.end}</td>
                      <td>${r.due ?? "-"}</td>
                      <td>${r.late}</td>
                    </tr>`
              )
              .join("")}</tbody>
          </table>
        </div>`;

      // Crée la section Gantt
      const section = document.createElement("div");
      section.className = "gantt-section";
      section.innerHTML = `<h4 style="color:#003377;margin:10px 0;">${method}</h4>`;

      metrics.rows.forEach(r => {
        const row = document.createElement("div");
        row.className = "task-row";

        const label = document.createElement("div");
        label.className = "task-label";
        label.textContent = r.name;

        const barC = document.createElement("div");
        barC.className = "task-bar-container";

        const bar = document.createElement("div");
        bar.className = "task-bar";
        bar.style.left = (r.start / globalMax) * 100 + "%";
        bar.style.width = (r.dur / globalMax) * 100 + "%";
        bar.textContent = `${r.dur}${globalUnit.label}`;

        barC.appendChild(bar);
        row.appendChild(label);
        row.appendChild(barC);
        section.appendChild(row);
      });

      // Ajout de l’axe du temps
      const axis = document.createElement("div");
      axis.className = "method-axis";
      const step = Math.ceil(globalMax / 10);
      for (let i = 0; i <= globalMax; i += step) {
        const tick = document.createElement("span");
        if (useRealDates && startDate) {
          const offset = i * globalUnit.factor * 3600000;
          const d = new Date(startDate.getTime() + offset);
          tick.textContent = d.toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
          });
        } else {
          tick.textContent = `${i}${globalUnit.label}`;
        }
        axis.appendChild(tick);
      }
      section.appendChild(axis);
      ganttArea.appendChild(section);
    });

    resContainer.innerHTML = html;
    renderIndices();
    thinkerAuto();
  }

  // ----- Indices -----
  function renderIndices() {
    if (!lastMetrics.length) return;
    let html = `
      <h3 style="text-align:center;color:#004aad;">📊 Indices de performance</h3>
      <div class="table-wrap">
        <table class="indices-table">
          <thead><tr><th>Méthode</th><th>Cmax</th><th>Tardiness</th><th>Moyenne</th></tr></thead>
          <tbody>${lastMetrics
            .map(
              it => `<tr>
                      <td>${it.method}</td>
                      <td>${it.metrics.makespan.toFixed(2)}</td>
                      <td>${it.metrics.totalLate?.toFixed(2) ?? 0}</td>
                      <td>${it.metrics.avg.toFixed(2)}</td>
                    </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`;
    el("indicesContainer").innerHTML = html;
  }

  // ----- IA -----
  function thinkerAuto() {
    if (!lastMetrics.length) return;
    const obj = getObjective();
    const best =
      obj === "Cmax"
        ? lastMetrics.reduce((a, b) =>
            a.metrics.makespan <= b.metrics.makespan ? a : b
          )
        : lastMetrics.reduce((a, b) =>
            a.metrics.totalLate <= b.metrics.totalLate ? a : b
          );

    el("aiThinker").innerHTML = `
      <h3>🤖 Analyse IA</h3>
      <p>Objectif : <strong>${obj}</strong></p>
      <p>✅ Recommandation : <strong style="color:#003377">${best.method}</strong></p>
      <p>Cmax = ${best.metrics.makespan.toFixed(
        2
      )}, Retard total = ${best.metrics.totalLate?.toFixed(2) ?? 0}</p>
    `;
  }

  // ----- Boutons -----
  el("addBtn").addEventListener("click", () => {
    const name = el("name").value.trim() || `T${tasks.length + 1}`;
    const dur = parseFloat(el("dur").value);
    const due = el("due").value ? parseFloat(el("due").value) : null;
    const hasPred = el("hasPred").checked;
    const predName = el("predName").value.trim() || null;
    const inputUnit = el("taskUnit").value;

    if (!dur || dur <= 0) return alert("Durée invalide");

    // Convertit la durée saisie dans l’unité globale choisie
    const global = unitInfo(el("timeUnit").value);
    const local = unitInfo(inputUnit);
    const durConverted = dur * (local.factor / global.factor);

    tasks.push({
      name,
      inputDur: dur,
      inputUnit,
      dur: durConverted,
      due,
      hasPred,
      predName,
    });

    refreshTable();
    clearResults();
  });

  el("clearBtn").addEventListener("click", () => {
    if (!confirm("Effacer toutes les tâches ?")) return;
    tasks = [];
    refreshTable();
    clearResults();
  });

  el("allBtn").addEventListener("click", renderResults);

  el("exampleBtn")?.addEventListener("click", () => {
    tasks = [
      { name: "A", dur: 4, inputDur: 4, inputUnit: "hours" },
      { name: "B", dur: 7, inputDur: 7, inputUnit: "hours" },
      { name: "C", dur: 3, inputDur: 3, inputUnit: "hours", predName: "B", hasPred: true },
    ];
    refreshTable();
  });

  // ----- Export PDF -----
  el("exportPDF").addEventListener("click", async () => {
    const pdf = new window.jspdf.jsPDF("p", "mm", "a4");
    const area = el("ganttArea");
    const canvas = await html2canvas(area, { scale: 2 });
    const img = canvas.toDataURL("image/png");
    pdf.addImage(img, "PNG", 10, 10, 190, (canvas.height * 190) / canvas.width);
    pdf.save("Ordonnancement.pdf");
  });

  // ----- Initialisation -----
  refreshTable();
})();

})();

