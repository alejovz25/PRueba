const STORAGE_KEY = "agro_ia_historial_v5";
const PENDING_KEY = "agro_ia_pendientes_v5";
const USERS_KEY = "agro_ia_usuarios_v5";
const SESSION_KEY = "agro_ia_sesion_v5";

let chartInstance = null;
let deferredInstallPrompt = null;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("btn-instalar-app");
  if (btn) btn.style.display = "inline-flex";
});

async function instalarApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else {
    alert(
      "Para instalar la App:\n" +
      "• En Celular (Android/Chrome): Menú (⋮) -> 'Instalar aplicación' o 'Agregar a pantalla de inicio'.\n" +
      "• En iPhone (Safari): Botón Compartir -> 'Agregar a inicio'.\n" +
      "• En Computador (Chrome/Edge): Haz clic en el ícono de instalar (+) en la barra de direcciones."
    );
  }
}

function getHistorialLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function setHistorialLocal(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    const optimizado = items.map((r, idx) => (idx < 10 ? r : { ...r, foto_base64: null }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(optimizado));
    } catch (_) {
      const sinFotos = items.map((r) => ({ ...r, foto_base64: null }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sinFotos));
      } catch (__) {}
    }
  }
}

function getPendientes() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function setPendientes(items) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch (_) {}
}

function getUsuariosCache() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
}

function setUsuariosCache(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getSesionActiva() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function setSesionActiva(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function aplicarEstadoAutenticacion() {
  const sesion = getSesionActiva();
  const vistaLogin = document.getElementById("vista-login");
  const appAuth = document.getElementById("app-autenticada");

  if (sesion && sesion.nombre) {
    vistaLogin.style.display = "none";
    appAuth.style.display = "block";
    document.getElementById("badge-usuario-activo").textContent = `👤 ${sesion.nombre} (${sesion.rol})`;
    renderFiltroUsuarios();
    renderHistorialLateral();
  } else {
    vistaLogin.style.display = "block";
    appAuth.style.display = "none";
  }
}

function toggleRegistroLogin() {
  const box = document.getElementById("box-registro-login");
  box.style.display = box.style.display === "none" ? "block" : "none";
}

function mostrarErrorLogin(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.style.display = "block";
}

async function crearUsuarioConClave() {
  const nombre = document.getElementById("reg-nombre").value.trim();
  const rol = document.getElementById("reg-rol").value;
  const password = document.getElementById("reg-password").value;

  if (!nombre || password.length < 4) {
    mostrarErrorLogin("Ingresa nombre y una contraseña de al menos 4 caracteres.");
    return;
  }

  if (navigator.onLine) {
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, rol, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        mostrarErrorLogin(data.error || "No se pudo crear el usuario.");
        return;
      }
      setUsuariosCache(data.usuarios);
      setSesionActiva({ id: data.usuario.id, nombre: data.usuario.nombre, rol: data.usuario.rol });
      document.getElementById("login-error").style.display = "none";
      aplicarEstadoAutenticacion();
      return;
    } catch (_) {}
  }

  const users = getUsuariosCache();
  if (users.some((u) => u.nombre.toLowerCase() === nombre.toLowerCase())) {
    mostrarErrorLogin("Ese usuario ya existe.");
    return;
  }
  const nuevo = { id: `user_${Date.now()}`, nombre, rol, password };
  users.push(nuevo);
  setUsuariosCache(users);
  setSesionActiva({ id: nuevo.id, nombre: nuevo.nombre, rol: nuevo.rol });
  document.getElementById("login-error").style.display = "none";
  aplicarEstadoAutenticacion();
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nombre = document.getElementById("login-nombre").value.trim();
  const password = document.getElementById("login-password").value;

  if (navigator.onLine) {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, password }),
      });
      const data = await res.json();
      if (data.ok && data.usuario) {
        const users = getUsuariosCache();
        const idx = users.findIndex((u) => u.nombre.toLowerCase() === data.usuario.nombre.toLowerCase());
        const entry = { ...data.usuario, password };
        if (idx >= 0) users[idx] = entry;
        else users.push(entry);
        setUsuariosCache(users);

        setSesionActiva(data.usuario);
        document.getElementById("login-error").style.display = "none";
        document.getElementById("login-password").value = "";
        aplicarEstadoAutenticacion();
        return;
      } else {
        mostrarErrorLogin(data.error || "Usuario o contraseña incorrectos.");
        return;
      }
    } catch (_) {}
  }

  const credencialesIniciales = [
    { id: "admin", nombre: "Administrador General", rol: "Administrador", password: "admin123" },
    { id: "tecnico1", nombre: "Técnico Agropecuario", rol: "Técnico", password: "tecnico123" },
    { id: "operario1", nombre: "Operario de Campo", rol: "Operario", password: "campo123" },
  ];
  const todos = [...getUsuariosCache(), ...credencialesIniciales];
  const match = todos.find(
    (u) => u.nombre.trim().toLowerCase() === nombre.toLowerCase() && u.password === password
  );

  if (match) {
    setSesionActiva({ id: match.id, nombre: match.nombre, rol: match.rol });
    document.getElementById("login-error").style.display = "none";
    document.getElementById("login-password").value = "";
    aplicarEstadoAutenticacion();
  } else {
    mostrarErrorLogin("Usuario o contraseña incorrectos.");
  }
});

function cerrarSesion() {
  setSesionActiva(null);
  aplicarEstadoAutenticacion();
}

function renderFiltroUsuarios() {
  const filtro = document.getElementById("filtro-usuario");
  const users = getUsuariosCache();
  const prev = filtro.value || "TODOS";
  filtro.innerHTML =
    `<option value="TODOS">Todos los usuarios</option>` +
    users.map((u) => `<option value="${u.nombre}">${u.nombre} (${u.rol})</option>`).join("");
  filtro.value = prev;
}

function actualizarEstadoRed() {
  const online = navigator.onLine;
  const badge = document.getElementById("estado-red");
  const badgeLogin = document.getElementById("estado-red-login");

  if (badge) {
    badge.textContent = online ? "🌐 En línea" : "📴 Sin internet (Offline)";
    badge.className = `tag is-small ${online ? "is-success" : "is-warning"}`;
  }
  if (badgeLogin) {
    badgeLogin.textContent = online ? "🌐 En línea" : "📴 Sin internet (Offline)";
    badgeLogin.className = `tag is-small mt-2 ${online ? "is-success" : "is-warning"}`;
  }
  if (online) sincronizarPendientes();
}

function cambiarCategoria() {
  const cat = document.getElementById("categoria").value;
  document.getElementById("bloque-cultivo").style.display = cat === "cultivo" ? "block" : "none";
  document.getElementById("bloque-animal").style.display = cat === "animal" ? "block" : "none";
}

function comprimirImagenBase64(file, maxWidth = 720, quality = 0.72) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = () => resolve(event.target.result.split(",")[1]);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function analizarFotoOfflineLocal(fotoBase64, esCultivo, producto, idNorm, cantidad, peso) {
  if (!fotoBase64) return null;
  const estado = esCultivo
    ? `Foto capturada de ${producto} en ${idNorm}; revisar follaje, coloración y humedad del suelo.`
    : `Foto capturada de ${cantidad} ${producto} en ${idNorm}; comparar condición corporal y peso (${peso} kg).`;
  return (
    `- ACCIÓN PRIORITARIA: Validar estado visual en campo para ${idNorm}.\n` +
    `- ESTADO VISUAL Y CRECIMIENTO: ${estado}\n` +
    `- RECOMENDACIÓN COMPLEMENTARIA: Conservar registro fotográfico periódico para comparar avance.`
  );
}

function inferenciaOffline(payload) {
  const ahora = new Date().toISOString().slice(0, 16).replace("T", " ");
  const idNorm = (payload.identificador || "LOTE-01").trim().toUpperCase();

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
    if (lluvia >= 15) alertas.push("Lluvia significativa: suspender o reducir riego.");

    const recPrincipal =
      lluvia >= 15
        ? `SUSPENDER RIEGO hoy en ${idNorm} (${payload.producto}) por lluvia de ${lluvia} mm.`
        : `APLICAR RIEGO AL ${(indice * 100).toFixed(0)}% en las ${ha.toFixed(2)} ha (${m2.toFixed(0)} m²) de ${payload.producto}.`;

    const analisisVisual = analizarFotoOfflineLocal(payload.foto_base64, true, payload.producto, idNorm);

    return {
      local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: ahora,
      categoria: "cultivo",
      identificador: idNorm,
      producto: payload.producto || "maiz",
      area_ha: Number(ha.toFixed(4)),
      area_m2: Number(m2.toFixed(1)),
      clima: { temp, radiacion: rad, humedad: hum, lluvia_mm: lluvia, alertas },
      usuario: { nombre: payload.usuario_nombre, rol: payload.usuario_rol },
      nota_personal: payload.nota_personal || "",
      recomendacion_principal: recPrincipal,
      prediccion_nn: {
        indice_riego: Number(indice.toFixed(2)),
        resumen: `Demanda hídrica: ${(indice * 100).toFixed(0)}% en ${ha.toFixed(2)} ha (${m2.toFixed(0)} m²).`,
      },
      ia: {
        recomendacion_principal: recPrincipal,
        diagnostico: `Evaluación local de ${payload.producto} (${idNorm}).`,
        contexto_historial: "Guardado sin internet (se sincronizará automáticamente).",
        recomendaciones: [`Revisar humedad del suelo y vigor foliar en ${payload.producto}.`],
        alertas,
        analisis_visual_ia: analisisVisual,
      },
      foto_base64: payload.foto_base64 || null,
    };
  } else {
    const cant = parseInt(payload.cantidad || 1, 10);
    const peso = parseFloat(payload.peso || 0);
    const largo = parseFloat(payload.largo || 0);
    const score = Math.min(1, Math.max(0, (peso / 300) * 0.55 + (largo / 180) * 0.45));

    const recPrincipal =
      score >= 0.55
        ? `LOTE LISTO (${idNorm}): Programar salida comercial o etapa de ${payload.proposito} para ${cant} ${payload.producto} (${peso} kg).`
        : `CONTINUAR DESARROLLO en ${idNorm}: Mantener ración balanceada y control sanitario para ${cant} ${payload.producto} (${peso} kg / ${largo} cm).`;

    const analisisVisual = analizarFotoOfflineLocal(
      payload.foto_base64,
      false,
      payload.producto,
      idNorm,
      cant,
      peso
    );

    return {
      local_id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fecha: ahora,
      categoria: "animal",
      identificador: idNorm,
      producto: payload.producto || "cerdo",
      proposito: payload.proposito || "producción",
      cantidad: cant,
      peso_kg: peso,
      largo_cm: largo,
      usuario: { nombre: payload.usuario_nombre, rol: payload.usuario_rol },
      nota_personal: payload.nota_personal || "",
      recomendacion_principal: recPrincipal,
      prediccion_nn: {
        indice_desarrollo: Number(score.toFixed(2)),
        resumen: `Lote de ${cant} ${payload.producto} | Peso: ${peso} kg | Largo: ${largo} cm.`,
      },
      ia: {
        recomendacion_principal: recPrincipal,
        diagnostico: `Seguimiento local de lote ${idNorm} (${payload.producto}).`,
        contexto_historial: "Guardado sin internet (se sincronizará automáticamente).",
        recomendaciones: [`Controlar ganancia de peso y tamaño hacia objetivo: ${payload.proposito}.`],
        alertas: [],
        analisis_visual_ia: analisisVisual,
      },
      foto_base64: payload.foto_base64 || null,
    };
  }
}

function abrirDetalleLote(identificador) {
  const idBuscado = (identificador || "").trim().toUpperCase();
  const historial = getHistorialLocal().filter(
    (r) => (r.identificador || "").trim().toUpperCase() === idBuscado
  );
  if (!historial.length) return;

  const masReciente = historial[0];
  const cronologico = [...historial].reverse();

  document.getElementById("vista-principal").style.display = "none";
  document.getElementById("vista-detalle-lote").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });

  const badge = document.getElementById("detalle-badge-tipo");
  badge.textContent = masReciente.categoria === "cultivo" ? "🌱 CULTIVO / PARCELA" : "🐄 LOTE ANIMAL";
  badge.className = `tag is-medium ${masReciente.categoria === "cultivo" ? "is-success" : "is-warning"}`;

  document.getElementById("detalle-titulo").textContent = `${masReciente.identificador} — ${masReciente.producto.toUpperCase()}`;
  document.getElementById("detalle-subtitulo").textContent =
    masReciente.categoria === "cultivo"
      ? `Área cultivada: ${masReciente.area_ha} ha (${masReciente.area_m2} m²) • Total seguimientos: ${historial.length}`
      : `Cantidad en lote: ${masReciente.cantidad} animales • Producto objetivo: ${masReciente.proposito} • Total seguimientos: ${historial.length}`;

  const recPrincipal =
    masReciente.recomendacion_principal ||
    masReciente.ia?.recomendacion_principal ||
    masReciente.prediccion_nn?.resumen ||
    "Continuar monitoreo periódico del lote.";
  document.getElementById("detalle-rec-principal").textContent = recPrincipal;

  const recs = masReciente.ia?.recomendaciones || [];
  const alertas = masReciente.ia?.alertas || [];
  const visualIa = masReciente.ia?.analisis_visual_ia || "";

  document.getElementById("detalle-ia-lista").innerHTML = `
    <p><strong>Diagnóstico Red Neuronal:</strong> ${masReciente.prediccion_nn?.resumen || ""}</p>
    <ul>
      ${recs.map((r) => `<li>✅ ${r}</li>`).join("")}
      ${alertas.map((a) => `<li class="has-text-danger">⚠️ ${a}</li>`).join("")}
    </ul>
    ${visualIa ? `<div class="notification is-info is-light p-2 mt-2" style="white-space:pre-line;"><strong>Análisis Visual:</strong>\n${visualIa}</div>` : ""}
  `;

  const conFotos = historial.filter((r) => r.foto_base64);
  const galeriaEl = document.getElementById("detalle-galeria-fotos");
  if (!conFotos.length) {
    galeriaEl.innerHTML = `<p class="is-size-7 has-text-grey">Este lote aún no tiene fotografías registradas.</p>`;
  } else {
    galeriaEl.innerHTML = `<div class="photo-grid">${conFotos
      .map(
        (r) => `
        <div class="box p-2 photo-card has-background-white">
          <img src="data:image/jpeg;base64,${r.foto_base64}" alt="Foto ${r.fecha}">
          <p class="is-size-7 has-text-weight-bold mt-1">🕒 ${r.fecha}</p>
          <p class="is-size-7 has-text-grey">👤 ${r.usuario?.nombre || "Personal"}</p>
          ${r.nota_personal ? `<p class="is-size-7 mt-1">"${r.nota_personal}"</p>` : ""}
        </div>`
      )
      .join("")}</div>`;
  }

  document.getElementById("detalle-bitacora").innerHTML = historial
    .map(
      (r) => `
      <div class="box p-3 mb-2 has-background-white">
        <div class="is-flex is-justify-content-space-between is-size-7 has-text-grey mb-1">
          <span>🕒 <strong>${r.fecha}</strong></span>
          <span>👤 Registrado por: <strong>${r.usuario?.nombre || "Usuario"}</strong> (${r.usuario?.rol || "Campo"})</span>
        </div>
        <p class="is-size-7 mb-1"><strong>Métricas:</strong> ${r.prediccion_nn?.resumen || ""}</p>
        ${
          r.nota_personal
            ? `<div class="notification is-warning is-light p-2 mt-1 mb-1 is-size-7"><strong>✍️ Anotación del personal:</strong> ${r.nota_personal}</div>`
            : `<p class="is-size-7 has-text-grey-light">Sin anotaciones manuales en este registro.</p>`
        }
      </div>`
    )
    .join("");

  const contenedorCanvas = document.getElementById("contenedor-canvas");
  if (typeof Chart === "undefined") {
    contenedorCanvas.innerHTML = `<p class="is-size-7 has-text-grey">Conéctate a internet una vez para almacenar en caché el motor de gráficas.</p>`;
    return;
  }

  contenedorCanvas.innerHTML = `<canvas id="grafica-seguimiento"></canvas>`;
  const ctx = document.getElementById("grafica-seguimiento").getContext("2d");
  if (chartInstance) chartInstance.destroy();

  const labels = cronologico.map((r) => r.fecha);
  const datasets = [];

  if (masReciente.categoria === "animal") {
    datasets.push({
      label: "Peso Promedio (kg)",
      data: cronologico.map((r) => Number(r.peso_kg || 0)),
      borderColor: "#2e7d32",
      backgroundColor: "rgba(46, 125, 50, 0.15)",
      tension: 0.3,
      fill: true,
    });
    datasets.push({
      label: "Tamaño / Largo (cm)",
      data: cronologico.map((r) => Number(r.largo_cm || 0)),
      borderColor: "#ef6c00",
      backgroundColor: "transparent",
      tension: 0.3,
    });
  } else {
    datasets.push({
      label: "Demanda Hídrica NN (%)",
      data: cronologico.map((r) => Number(((r.prediccion_nn?.indice_riego || 0) * 100).toFixed(1))),
      borderColor: "#0277bd",
      backgroundColor: "rgba(2, 119, 189, 0.15)",
      tension: 0.3,
      fill: true,
    });
    datasets.push({
      label: "Temperatura (°C)",
      data: cronologico.map((r) => Number(r.clima?.temp || 0)),
      borderColor: "#d84315",
      backgroundColor: "transparent",
      tension: 0.3,
    });
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function cerrarDetalleLote() {
  document.getElementById("vista-detalle-lote").style.display = "none";
  document.getElementById("vista-principal").style.display = "flex";
}

function renderHistorialLateral() {
  const cont = document.getElementById("historial-lateral");
  const filtroUser = document.getElementById("filtro-usuario").value;
  let historial = getHistorialLocal();

  if (filtroUser && filtroUser !== "TODOS") {
    historial = historial.filter((r) => r.usuario?.nombre === filtroUser);
  }

  if (!historial.length) {
    cont.innerHTML = `<p class="has-text-grey is-size-7">No hay lotes registrados todavía.</p>`;
    return;
  }

  const grupos = {};
  for (const reg of historial) {
    const id = (reg.identificador || "SIN-ID").trim().toUpperCase();
    if (!grupos[id]) grupos[id] = [];
    grupos[id].push(reg);
  }

  cont.innerHTML = "";
  Object.entries(grupos).forEach(([id, items]) => {
    const ultimo = items[0];
    const fotosCount = items.filter((i) => i.foto_base64).length;
    const tagClass = ultimo.categoria === "cultivo" ? "is-success" : "is-warning";

    const card = document.createElement("div");
    card.className = "box p-3 mb-3 has-background-white-bis lote-card";
    card.style.borderLeft = "5px solid #2e7d32";
    card.dataset.id = id;
    card.addEventListener("click", () => abrirDetalleLote(id));

    card.innerHTML = `
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-1">
        <strong class="is-size-6">🏷️ ${id} — ${ultimo.producto.toUpperCase()}</strong>
        <span class="tag is-small ${tagClass}">${ultimo.categoria}</span>
      </div>
      <p class="is-size-7 has-text-warning-dark has-text-weight-semibold mb-1">
        ⭐ ${ultimo.recomendacion_principal || ultimo.prediccion_nn?.resumen}
      </p>
      <div class="is-flex is-justify-content-space-between is-size-7 has-text-grey mt-2">
        <span>📊 ${items.length} registros • 📸 ${fotosCount} fotos</span>
        <span>👤 ${ultimo.usuario?.nombre || "Personal"} (${ultimo.fecha})</span>
      </div>
    `;
    cont.appendChild(card);
  });
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
      if (getSesionActiva()) renderHistorialLateral();
    }
  } catch (_) {}
}

document.getElementById("form-registro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sesion = getSesionActiva();
  if (!sesion) {
    aplicarEstadoAutenticacion();
    return;
  }

  const cat = document.getElementById("categoria").value;
  const file = document.getElementById("foto").files[0];
  const fotoBase64 = await comprimirImagenBase64(file);
  const idLote = document.getElementById(cat === "cultivo" ? "id_cultivo" : "id_animal").value.trim().toUpperCase();

  const payload = {
    categoria: cat,
    identificador: idLote,
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
    nota_personal: document.getElementById("nota_personal").value,
    usuario_nombre: sesion.nombre,
    usuario_rol: sesion.rol,
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
        renderHistorialLateral();
        document.getElementById("nota_personal").value = "";
        document.getElementById("foto").value = "";
        abrirDetalleLote(idLote);
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

  renderHistorialLateral();
  document.getElementById("nota_personal").value = "";
  document.getElementById("foto").value = "";
  abrirDetalleLote(idLote);
});

window.addEventListener("online", actualizarEstadoRed);
window.addEventListener("offline", actualizarEstadoRed);

(async function init() {
  actualizarEstadoRed();
  aplicarEstadoAutenticacion();

  if (navigator.onLine) {
    try {
      const [resH, resU] = await Promise.all([fetch("/api/historial"), fetch("/api/usuarios")]);
      const dataH = await resH.json();
      const dataU = await resU.json();
      if (dataU.ok && dataU.usuarios.length) {
        const actualesCache = getUsuariosCache();
        const combinados = dataU.usuarios.map((u) => {
          const localMatch = actualesCache.find((lu) => lu.nombre.toLowerCase() === u.nombre.toLowerCase());
          return localMatch && localMatch.password ? { ...u, password: localMatch.password } : u;
        });
        setUsuariosCache(combinados);
        renderFiltroUsuarios();
      }
      if (dataH.ok && dataH.historial.length) {
        setHistorialLocal(dataH.historial);
        if (getSesionActiva()) renderHistorialLateral();
      }
    } catch (_) {}
  }
})();