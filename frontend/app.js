const STORAGE_KEY = "agro_ia_historial_v1";
const PENDING_KEY = "agro_ia_pendientes_v1";

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

    return {
      local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: ahora,
      categoria: "cultivo",
      identificador: payload.identificador || "PARCELA-01",
      producto: payload.producto || "maiz",
      area_ha: Number(ha.toFixed(4)),
      area_m2: Number(m2.toFixed(1)),
      clima: { temp, radiacion: rad, humedad: hum, lluvia_mm: lluvia, alertas },
      prediccion_nn: {
        indice_riego: Number(indice.toFixed(2)),
        resumen: `Demanda hídrica: ${(indice * 100).toFixed(0)}% en ${ha.toFixed(2)} ha (${m2.toFixed(0)} m²).`,
      },
      ia: {
        diagnostico: `Evaluación offline de ${payload.producto} (${payload.identificador}).`,
        contexto_historial: "Guardado localmente sin internet (se sincronizará al conectar).",
        recomendaciones: [`Verificar humedad y desarrollo foliar de ${payload.producto}.`],
        alertas,
      },
      foto_base64: payload.foto_base64 || null,
    };
  } else {
    const cant = parseInt(payload.cantidad || 1, 10);
    const peso = parseFloat(payload.peso || 0);
    const largo = parseFloat(payload.largo || 0);
    const score = Math.min(1, Math.max(0, (peso / 300) * 0.55 + (largo / 180) * 0.45));
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
      prediccion_nn: {
        indice_desarrollo: Number(score.toFixed(2)),
        resumen: `Lote de ${cant} ${payload.producto} | Peso: ${peso} kg | Largo: ${largo} cm.`,
      },
      ia: {
        diagnostico: `Seguimiento offline de lote ${payload.identificador} (${payload.producto}).`,
        contexto_historial: "Guardado localmente sin internet (se sincronizará al conectar).",
        recomendaciones: [`Mantener control de peso y talla para objetivo: ${payload.proposito}.`],
        alertas: [],
      },
      foto_base64: payload.foto_base64 || null,
    };
  }
}

function renderResultado(reg) {
  const box = document.getElementById("resultado-actual");
  const alertasHtml = (reg.ia?.alertas || []).map((a) => `<li>⚠️ ${a}</li>`).join("");
  const recsHtml = (reg.ia?.recomendaciones || []).map((r) => `<li>✅ ${r}</li>`).join("");

  box.style.display = "block";
  box.innerHTML = `
    <div class="notification is-success is-light p-3">
      <p class="title is-6 mb-2">📌 ${reg.identificador} — ${reg.producto.toUpperCase()}</p>
      <p class="is-size-7 mb-1"><strong>Diagnóstico:</strong> ${reg.ia?.diagnostico || reg.prediccion_nn?.resumen}</p>
      <p class="is-size-7 mb-1"><strong>Historial:</strong> ${reg.ia?.contexto_historial || ""}</p>
      ${recsHtml ? `<p class="is-size-7 mt-2 mb-1"><strong>Recomendaciones:</strong></p><ul class="is-size-7">${recsHtml}</ul>` : ""}
      ${alertasHtml ? `<p class="is-size-7 mt-2 mb-1 has-text-danger"><strong>Alertas:</strong></p><ul class="is-size-7 has-text-danger">${alertasHtml}</ul>` : ""}
    </div>
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

      const tarjetas = items
        .map((r) => {
          const detalle =
            r.categoria === "cultivo"
              ? `Clima: ${r.clima?.temp}°C, Rad: ${r.clima?.radiacion} W/m², Hum: ${r.clima?.humedad}%, Lluvia: ${r.clima?.lluvia_mm} mm | ${r.prediccion_nn?.resumen || ""}`
              : `Peso: ${r.peso_kg} kg, Largo: ${r.largo_cm} cm | ${r.prediccion_nn?.resumen || ""}`;

          const imgHtml = r.foto_base64
            ? `<img src="data:image/jpeg;base64,${r.foto_base64}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;" class="mr-2">`
            : "";

          return `
            <div class="box p-2 mb-2 has-background-white">
              <div class="is-flex is-align-items-start">
                ${imgHtml}
                <div class="is-size-7" style="flex:1;">
                  <p class="has-text-grey mb-1">🕒 ${r.fecha}</p>
                  <p class="mb-1">${detalle}</p>
                  ${r.ia?.analisis_visual_ia ? `<p class="has-text-link mt-1" style="white-space:pre-line;"><strong>IA Visual:</strong>\n${r.ia.analisis_visual_ia}</p>` : ""}
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="box p-3 mb-3 has-background-white-bis" style="border-left: 4px solid #2e7d32;">
          <div class="is-flex is-justify-content-space-between is-align-items-center mb-1">
            <strong>🏷️ ${id}</strong>
            <span class="tag is-small ${tagClass}">${primero.categoria}</span>
          </div>
          <p class="is-size-7 has-text-grey mb-2">${subtitulo}</p>
          ${tarjetas}
        </div>
      `;
    })
    .join("");
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

  const payload = {
    categoria: cat,
    identificador: document.getElementById(cat === "cultivo" ? "id_cultivo" : "id_animal").value,
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