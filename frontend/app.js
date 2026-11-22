const STORAGE_KEY = "agro_ia_historial_v1";
const PENDING_KEY = "agro_ia_pendientes_v1";

let chartInstance = null;
let identificadorActivo = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

const getHistorialLocal = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const setHistorialLocal = (items) => localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
const getPendientes = () => JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
const setPendientes = (items) => localStorage.setItem(PENDING_KEY, JSON.stringify(items));

function actualizarEstadoRed() {
  const badge = document.getElementById("estado-red");
  const online = navigator.onLine;
  badge.textContent = online ? "🌐 En línea" : "📴 Sin internet (Offline)";
  badge.className = `tag is-medium ${online ? "is-success" : "is-warning"}`;
  if (online) sincronizarPendientes();
}

function cambiarCategoria() {
  const cat = document.getElementById("categoria").value;
  document.getElementById("bloque-cultivo").style.display = cat === "cultivo" ? "block" : "none";
  document.getElementById("bloque-animal").style.display = cat === "animal" ? "block" : "none";
}

function leerImagenBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function inferenciaOffline(payload) {
  const ahora = new Date().toISOString().slice(0, 16).replace("T", " ");
  const anotacion = (payload.anotacion_personal || "").trim();

  if (payload.categoria === "cultivo") {
    const areaVal = parseFloat(payload.area || 1);
    const ha = payload.unidad_area === "ha" ? areaVal : areaVal / 10000;
    const m2 = payload.unidad_area === "ha" ? areaVal * 10000 : areaVal;
    const temp = parseFloat(payload.temp || 26);
    const rad = parseFloat(payload.radiacion || 650);
    const hum = parseFloat(payload.humedad || 70);
    const lluvia = parseFloat(payload.lluvia_mm || 0);
    const indice = Math.min(1, Math.max(0, (temp / 40) * 0.4 + (rad / 1100) * 0.35 + (1 - hum / 100) * 0.25));
    const alertas = [];
    if (temp > 34) alertas.push("Temperatura alta (>34°C): vigilar estrés hídrico.");
    if (lluvia >= 15) alertas.push("Lluvia registrada: reducir riego artificial.");

    const recs = [`Ajustar riego al ${(indice * 100).toFixed(0)}% en ${ha.toFixed(2)} ha (${m2.toFixed(0)} m²).`];
    if (anotacion) recs.push(`Anotación registrada: "${anotacion}".`);

    return {
      local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: ahora,
      categoria: "cultivo",
      identificador: payload.identificador || "PARCELA-01",
      producto: payload.producto || "maiz",
      area_ha: Number(ha.toFixed(4)),
      area_m2: Number(m2.toFixed(1)),
      clima: { temp, radiacion: rad, humedad: hum, lluvia_mm: lluvia, alertas },
      anotacion_personal: anotacion,
      prediccion_nn: {
        indice_riego: Number(indice.toFixed(2)),
        resumen: `Demanda hídrica: ${(indice * 100).toFixed(0)}% en ${ha.toFixed(2)} ha (${m2.toFixed(0)} m²).`,
      },
      ia: {
        recomendacion_principal: `Aplicar riego al ${(indice * 100).toFixed(0)}% en ${payload.identificador || "PARCELA-01"} (${payload.producto || "maiz"}).`,
        diagnostico: `Evaluación offline de ${payload.producto} (${payload.identificador}).`,
        contexto_historial: "Guardado localmente sin internet.",
        recomendaciones: recs,
        alertas,
      },
      foto_base64: payload.foto_base64 || null,
    };
  } else {
    const cant = parseInt(payload.cantidad || 1, 10);
    const peso = parseFloat(payload.peso || 0);
    const largo = parseFloat(payload.largo || 0);
    const score = Math.min(1, Math.max(0, (peso / 300) * 0.55 + (largo / 180) * 0.45));
    const recs = [`Controlar peso (${peso} kg) y largo (${largo} cm) en lote de ${cant} ${payload.producto}.`];
    if (anotacion) recs.push(`Anotación registrada: "${anotacion}".`);

    return {
      local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: ahora,
      categoria: "animal",
      identificador: payload.identificador || "LOTE-01",
      producto: payload.producto || "cerdo",
      proposito: payload.proposito || "producción",
      cantidad: cant,
      peso_kg: peso,
      largo_cm: largo,
      anotacion_personal: anotacion,
      prediccion_nn: {
        indice_desarrollo: Number(score.toFixed(2)),
        resumen: `Lote de ${cant} ${payload.producto} | Peso: ${peso} kg | Largo: ${largo} cm.`,
      },
      ia: {
        recomendacion_principal: `Monitorear crecimiento (${peso} kg / ${largo} cm) del lote ${payload.identificador || "LOTE-01"} orientado a ${payload.proposito || "producción"}.`,
        diagnostico: `Seguimiento offline de lote ${payload.identificador} (${payload.producto}).`,
        contexto_historial: "Guardado localmente sin internet.",
        recomendaciones: recs,
        alertas: [],
      },
      foto_base64: payload.foto_base64 || null,
    };
  }
}

function renderResultado(reg) {
  const box = document.getElementById("resultado-actual");
  const recPrincipal = reg.ia?.recomendacion_principal || reg.prediccion_nn?.resumen || "";
  box.style.display = "block";
  box.innerHTML = `
    <div class="notification is-success is-light p-3">
      <p class="is-size-7 mb-1"><strong>⭐ Recomendación Principal:</strong> ${recPrincipal}</p>
      <p class="is-size-7 mb-2"><strong>Identificador:</strong> ${reg.identificador}</p>
      <button type="button" class="button is-small is-success" onclick="abrirDetalleLote('${reg.identificador.replace(/'/g, "\\'")}')">
        🔍 Abrir Seguimiento del Lote
      </button>
    </div>
  `;
}

function cerrarDetalleLote() {
  identificadorActivo = null;
  document.getElementById("detalle-lote-panel").style.display = "none";
}

function abrirDetalleLote(identificador) {
  identificadorActivo = identificador;
  const todos = getHistorialLocal().filter((r) => (r.identificador || "SIN-ID") === identificador);
  const panel = document.getElementById("detalle-lote-panel");

  if (!todos.length) {
    panel.style.display = "none";
    return;
  }

  // Orden cronológico ascendente para la gráfica y evolución
  const cronologico = [...todos].reverse();
  const ultimo = todos[0];

  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  document.getElementById("detalle-titulo").textContent = `📌 Seguimiento: ${identificador}`;
  document.getElementById("detalle-subtitulo").textContent =
    ultimo.categoria === "cultivo"
      ? `Cultivo: ${ultimo.producto.toUpperCase()} | Área: ${ultimo.area_ha} ha (${ultimo.area_m2} m²) | Registros: ${todos.length}`
      : `Animal: ${ultimo.producto.toUpperCase()} | Cantidad: ${ultimo.cantidad} und. | Producto: ${ultimo.proposito || ""} | Registros: ${todos.length}`;

  // 1. RECOMENDACIÓN PRINCIPAL AL PRINCIPIO
  const recPrincipal =
    ultimo.ia?.recomendacion_principal ||
    (ultimo.ia?.recomendaciones && ultimo.ia.recomendaciones[0]) ||
    ultimo.prediccion_nn?.resumen ||
    "Sin recomendación registrada.";

  document.getElementById("detalle-rec-principal").innerHTML = `
    <p class="title is-6 mb-1">⭐ Recomendación Principal</p>
    <p class="is-size-6 has-text-weight-semibold">${recPrincipal}</p>
  `;

  // 2. GRÁFICA DE SEGUIMIENTO
  const labels = cronologico.map((r, idx) => r.fecha || `Reg ${idx + 1}`);
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const ctx = document.getElementById("grafica-seguimiento").getContext("2d");
  if (typeof Chart !== "undefined") {
    if (ultimo.categoria === "cultivo") {
      chartInstance = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Índice de Riego (0 a 1)",
              data: cronologico.map((r) => r.prediccion_nn?.indice_riego ?? 0),
              borderColor: "#1b5e20",
              backgroundColor: "rgba(27, 94, 32, 0.15)",
              tension: 0.25,
            },
            {
              label: "Temperatura (°C)",
              data: cronologico.map((r) => r.clima?.temp ?? 0),
              borderColor: "#d97706",
              backgroundColor: "rgba(217, 119, 6, 0.15)",
              tension: 0.25,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: "top" } } },
      });
    } else {
      chartInstance = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Peso Promedio (kg)",
              data: cronologico.map((r) => r.peso_kg ?? 0),
              borderColor: "#1b5e20",
              backgroundColor: "rgba(27, 94, 32, 0.15)",
              tension: 0.25,
            },
            {
              label: "Tamaño / Largo (cm)",
              data: cronologico.map((r) => r.largo_cm ?? 0),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.15)",
              tension: 0.25,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: "top" } } },
      });
    }
  }

  // 3. HISTORIAL FOTOGRÁFICO
  const fotosCont = document.getElementById("detalle-fotos");
  const conFoto = todos.filter((r) => r.foto_base64);
  if (!conFoto.length) {
    fotosCont.innerHTML = `<div class="column"><p class="has-text-grey">No hay fotografías registradas para este identificador.</p></div>`;
  } else {
    fotosCont.innerHTML = conFoto
      .map(
        (r) => `
        <div class="column is-4">
          <div class="card p-2">
            <img src="data:image/jpeg;base64,${r.foto_base64}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;" alt="Foto">
            <p class="is-size-7 has-text-grey mt-1">🕒 ${r.fecha}</p>
            <p class="is-size-7">${r.categoria === "cultivo" ? `Temp: ${r.clima?.temp}°C` : `Peso: ${r.peso_kg} kg | Largo: ${r.largo_cm} cm`}</p>
          </div>
        </div>
      `
      )
      .join("");
  }

  // 4. ANOTACIONES DEL PERSONAL
  const anotCont = document.getElementById("detalle-anotaciones");
  const anotaciones = todos.filter((r) => r.anotacion_personal && r.anotacion_personal.trim() !== "");
  if (!anotaciones.length) {
    anotCont.innerHTML = `<p class="has-text-grey">Sin anotaciones del personal en este seguimiento.</p>`;
  } else {
    anotCont.innerHTML = anotaciones
      .map((r) => `<p class="mb-1">• <strong>[${r.fecha}]</strong> ${r.anotacion_personal}</p>`)
      .join("");
  }

  // 5. RECOMENDACIONES DE LA INTELIGENCIA ARTIFICIAL
  const iaCont = document.getElementById("detalle-ia");
  const recs = ultimo.ia?.recomendaciones || [];
  const alertas = ultimo.ia?.alertas || [];
  const visual = ultimo.ia?.analisis_visual_ia || "";

  iaCont.innerHTML = `
    <p class="mb-1"><strong>Diagnóstico:</strong> ${ultimo.ia?.diagnostico || ultimo.prediccion_nn?.resumen || ""}</p>
    ${recs.length ? `<ul class="mb-2">${recs.map((x) => `<li>✅ ${x}</li>`).join("")}</ul>` : ""}
    ${alertas.length ? `<ul class="has-text-danger mb-2">${alertas.map((a) => `<li>⚠️ ${a}</li>`).join("")}</ul>` : ""}
    ${visual ? `<div class="box has-background-white p-2 mt-2" style="white-space:pre-line;"><strong>Análisis Visual IA:</strong>\n${visual}</div>` : ""}
  `;
}

function renderHistorialLateral(historial) {
  const cont = document.getElementById("historial-lateral");
  if (!historial || !historial.length) {
    cont.innerHTML = `<p class="has-text-grey is-size-7">Sin registros aún.</p>`;
    return;
  }

  const grupos = {};
  for (const reg of historial) {
    const id = reg.identificador || "SIN-ID";
    if (!grupos[id]) grupos[id] = [];
    grupos[id].push(reg);
  }

  cont.innerHTML = Object.entries(grupos)
    .map(([id, items]) => {
      const primero = items[0];
      const tagClass = primero.categoria === "cultivo" ? "is-success" : "is-warning";
      const subtitulo =
        primero.categoria === "cultivo"
          ? `Cultivo: ${primero.producto} | Área: ${primero.area_ha} ha (${primero.area_m2} m²)`
          : `Animal: ${primero.producto} | Lote: ${primero.cantidad} und. | Producto: ${primero.proposito || ""}`;

      const recTop = primero.ia?.recomendacion_principal || primero.prediccion_nn?.resumen || "";

      return `
        <div class="box p-3 mb-3 has-background-white-bis" style="border-left: 4px solid #2e7d32;">
          <div class="is-flex is-justify-content-space-between is-align-items-center mb-1">
            <strong>🏷️ ${id}</strong>
            <span class="tag is-small ${tagClass}">${primero.categoria} (${items.length})</span>
          </div>
          <p class="is-size-7 has-text-grey mb-1">${subtitulo}</p>
          <p class="is-size-7 mb-2"><strong>⭐ Recomendación principal:</strong> ${recTop}</p>
          <button type="button" class="button is-small is-link is-light" onclick="abrirDetalleLote('${id.replace(/'/g, "\\'")}')">
            Abrir seguimiento, gráfica y fotos
          </button>
        </div>
      `;
    })
    .join("");

  if (identificadorActivo) {
    abrirDetalleLote(identificadorActivo);
  }
}

async function sincronizarPendientes() {
  const pendientes = getPendientes();
  if (!pendientes.length || !navigator.onLine) return;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendientes }),
    });
    if (res.ok) {
      const data = await res.json();
      setPendientes([]);
      setHistorialLocal(data.historial);
      renderHistorialLateral(data.historial);
    }
  } catch (_) {}
}

document.getElementById("form-registro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cat = document.getElementById("categoria").value;
  const file = document.getElementById("foto").files[0];
  const fotoBase64 = await leerImagenBase64(file);
  const identificador = document.getElementById(cat === "cultivo" ? "id_cultivo" : "id_animal").value;

  const payload = {
    categoria: cat,
    identificador,
    producto: document.getElementById(cat === "cultivo" ? "prod_cultivo" : "prod_animal").value,
    unidad_area: document.getElementById("unidad_area").value,
    area: document.getElementById("area").value,
    temp: document.getElementById("temp").value,
    radiacion: document.getElementById("radiacion").value,
    humedad: document.getElementById("humedad").value,
    lluvia_mm: document.getElementById("lluvia_mm").value,
    cantidad: document.getElementById("cantidad").value,
    peso: document.getElementById("peso").value,
    largo: document.getElementById("largo").value,
    proposito: document.getElementById("proposito").value,
    anotacion_personal: document.getElementById("anotacion_personal").value,
    api_key: document.getElementById("api_key").value,
    foto_base64: fotoBase64,
  };

  if (navigator.onLine) {
    try {
      const formData = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== null && v !== undefined) formData.append(k, v);
      });
      if (file) formData.append("foto", file);

      const res = await fetch("/api/analizar", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        setHistorialLocal(data.historial);
        renderResultado(data.registro);
        renderHistorialLateral(data.historial);
        abrirDetalleLote(data.registro.identificador);
        document.getElementById("anotacion_personal").value = "";
        return;
      }
    } catch (_) {}
  }

  const regOffline = inferenciaOffline(payload);
  const pendientes = getPendientes();
  pendientes.unshift(regOffline);
  setPendientes(pendientes);

  const hist = getHistorialLocal();
  hist.unshift(regOffline);
  setHistorialLocal(hist);

  renderResultado(regOffline);
  renderHistorialLateral(hist);
  abrirDetalleLote(regOffline.identificador);
  document.getElementById("anotacion_personal").value = "";
});

window.addEventListener("online", actualizarEstadoRed);
window.addEventListener("offline", actualizarEstadoRed);

(async function init() {
  actualizarEstadoRed();
  const localHist = getHistorialLocal();
  renderHistorialLateral(localHist);
  if (navigator.onLine) {
    try {
      const res = await fetch("/api/historial");
      const data = await res.json();
      if (data.ok && data.historial.length) {
        setHistorialLocal(data.historial);
        renderHistorialLateral(data.historial);
      }
    } catch (_) {}
  }
})();