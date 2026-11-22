import io
import math
import os
import traceback
from flask import Flask, jsonify, render_template, request
from google import genai
from PIL import Image
import torch

from models.train_models import AnimalNN, CultivoNN, PRODUCTOS_ANIMAL, PRODUCTOS_CULTIVO, entrenar
from backend.storage import (
    agregar_registro,
    cargar_historial,
    cargar_usuarios,
    guardar_historial,
    registrar_usuario,
)

app = Flask(
    __name__,
    template_folder="../frontend",
    static_folder="../frontend",
    static_url_path="",
)

if not (os.path.exists("models/cultivo_nn.pt") and os.path.exists("models/animal_nn.pt")):
    entrenar()

modelo_cultivo = CultivoNN()
modelo_animal = AnimalNN()
modelo_cultivo.load_state_dict(torch.load("models/cultivo_nn.pt", map_location="cpu"))
modelo_animal.load_state_dict(torch.load("models/animal_nn.pt", map_location="cpu"))
modelo_cultivo.eval()
modelo_animal.eval()


def convertir_area(valor, unidad):
    valor = float(valor or 0)
    if unidad == "ha":
        return valor, valor * 10000.0
    return valor / 10000.0, valor


def evaluar_cultivo(payload):
    identificador = (payload.get("identificador") or "PARCELA-01").strip().upper()
    producto = (payload.get("producto") or "maiz").lower()
    unidad_area = payload.get("unidad_area", "ha")
    area_ha, area_m2 = convertir_area(payload.get("area", 1.0), unidad_area)

    temp = float(payload.get("temp", 26.0))
    rad = float(payload.get("radiacion", 650.0))
    hum = float(payload.get("humedad", 70.0))
    lluvia_mm = float(payload.get("lluvia_mm", 0.0))

    factor = PRODUCTOS_CULTIVO.get(producto, 1.0)
    with torch.no_grad():
        x = torch.tensor(
            [[temp / 40.0, rad / 1100.0, hum / 100.0, math.log1p(area_ha) / 3.5, factor / 1.5]],
            dtype=torch.float32,
        )
        indice_riego = float(modelo_cultivo(x).item())

    alertas = []
    if temp > 34:
        alertas.append("Temperatura alta (>34°C): riesgo de estrés hídrico.")
    if lluvia_mm >= 15:
        alertas.append("Lluvia significativa: suspender o reducir riego artificial.")
    if hum < 45:
        alertas.append("Baja humedad ambiental (<45%): vigilar evapotranspiración.")

    if lluvia_mm >= 15:
        rec_principal = f"SUSPENDER RIEGO hoy en {identificador} ({producto}) por lluvia acumulada de {lluvia_mm} mm y revisar drenajes."
    elif indice_riego >= 0.7:
        rec_principal = f"ACTIVAR RIEGO INTENSIVO ({indice_riego*100:.0f}%) en las {area_ha:.2f} ha ({area_m2:.0f} m²) de {producto} durante horas frescas."
    elif indice_riego >= 0.4:
        rec_principal = f"APLICAR RIEGO MODERADO ({indice_riego*100:.0f}%) en {identificador} y monitorear humedad del suelo."
    else:
        rec_principal = f"MANTENER RIEGO MÍNIMO ({indice_riego*100:.0f}%) en {identificador}; condiciones climáticas estables para {producto}."

    return {
        "categoria": "cultivo",
        "identificador": identificador,
        "producto": producto,
        "area_ha": round(area_ha, 4),
        "area_m2": round(area_m2, 1),
        "clima": {
            "temp": temp,
            "radiacion": rad,
            "humedad": hum,
            "lluvia_mm": lluvia_mm,
            "alertas": alertas,
        },
        "prediccion_nn": {
            "indice_riego": round(indice_riego, 2),
            "valor_grafico": round(indice_riego * 100, 1),
            "etiqueta_grafico": "Demanda Hídrica (%)",
            "resumen": f"Demanda hídrica: {indice_riego*100:.0f}% para {producto} ({area_ha:.2f} ha / {area_m2:.0f} m²).",
        },
        "recomendacion_principal": rec_principal,
    }


def evaluar_animal(payload):
    identificador = (payload.get("identificador") or "LOTE-01").strip().upper()
    producto = (payload.get("producto") or "cerdo").lower()
    cantidad = int(float(payload.get("cantidad", 1)))
    peso = float(payload.get("peso", 0.0))
    largo = float(payload.get("largo", 0.0))
    proposito = (payload.get("proposito") or "producción").strip()

    factor = PRODUCTOS_ANIMAL.get(producto, 1.0)
    with torch.no_grad():
        x = torch.tensor(
            [[peso / 500.0, largo / 220.0, math.log1p(max(cantidad, 1)) / 5.5, factor / 1.5]],
            dtype=torch.float32,
        )
        indice_desarrollo = float(modelo_animal(x).item())

    if indice_desarrollo >= 0.55:
        etapa = "Óptimo para producción/comercialización"
        rec_principal = f"LOTE LISTO ({identificador}): Programar salida comercial o etapa de {proposito} para los {cantidad} {producto} (peso prom. {peso} kg)."
    else:
        etapa = "En fase de crecimiento y seguimiento"
        rec_principal = f"CONTINUAR ENGORDE / DESARROLLO en {identificador}: Mantener ración balanceada y control sanitario para {cantidad} {producto} (actual: {peso} kg / {largo} cm)."

    return {
        "categoria": "animal",
        "identificador": identificador,
        "producto": producto,
        "proposito": proposito,
        "cantidad": cantidad,
        "peso_kg": peso,
        "largo_cm": largo,
        "prediccion_nn": {
            "indice_desarrollo": round(indice_desarrollo, 2),
            "valor_grafico": peso,
            "etiqueta_grafico": "Peso Promedio (kg)",
            "resumen": f"{etapa} ({producto}, lote de {cantidad} und., {peso} kg, {largo} cm).",
        },
        "recomendacion_principal": rec_principal,
    }


def estructurar_ia(base_info, historial_previo, nota_personal="", foto_bytes=None, api_key=None):
    recomendaciones = []
    alertas = []

    if base_info["categoria"] == "cultivo":
        alertas.extend(base_info["clima"]["alertas"])
        recomendaciones.extend([
            f"Ajustar lámina de riego al {base_info['prediccion_nn']['indice_riego']*100:.0f}% en {base_info['area_ha']} ha.",
            f"Verificar presencia de plagas o deficiencias nutricionales en hojas de {base_info['producto']}.",
        ])
    else:
        recomendaciones.extend([
            f"Registrar pesaje periódico de muestra sobre los {base_info['cantidad']} animales del lote.",
            f"Asegurar disponibilidad de agua limpia y plan sanitario enfocado en {base_info['proposito']}.",
        ])

    if nota_personal:
        recomendaciones.append(f"Seguimiento a observación de campo: '{nota_personal}'.")

    estructura = {
        "recomendacion_principal": base_info["recomendacion_principal"],
        "diagnostico": base_info["prediccion_nn"]["resumen"],
        "contexto_historial": f"Total de seguimientos previos en este lote/parcela: {len(historial_previo)}.",
        "recomendaciones": recomendaciones,
        "alertas": alertas,
    }

    if foto_bytes and api_key:
        try:
            img = Image.open(io.BytesIO(foto_bytes))
            client = genai.Client(api_key=api_key)
            prompt = (
                f"Analiza esta fotografía del lote/parcela '{base_info['identificador']}' ({base_info['producto']}). "
                f"Nota del personal: '{nota_personal}'. Datos técnicos: {base_info}. "
                f"Responde de forma muy clara y estructurada en 3 puntos:\n"
                f"1. ACCIÓN PRIORITARIA:\n2. ESTADO VISUAL Y CRECIMIENTO:\n3. RECOMENDACIÓN COMPLEMENTARIA:"
            )
            resp = client.models.generate_content(model="gemini-2.5-flash", contents=[img, prompt])
            estructura["analisis_visual_ia"] = resp.text
        except Exception as e:
            estructura["alertas"].append(f"Análisis visual IA no disponible: {e}")

    return estructura


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/usuarios", methods=["GET", "POST"])
def api_usuarios():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        nombre = data.get("nombre", "").strip()
        rol = data.get("rol", "Operario").strip()
        if not nombre:
            return jsonify({"ok": False, "error": "Nombre requerido"}), 400
        usuarios, nuevo = registrar_usuario(nombre, rol)
        return jsonify({"ok": True, "usuarios": usuarios, "usuario": nuevo})
    return jsonify({"ok": True, "usuarios": cargar_usuarios()})


@app.route("/api/analizar", methods=["POST"])
def analizar():
    try:
        form = request.form
        usuario_nombre = (form.get("usuario_nombre") or "Usuario General").strip()
        usuario_rol = (form.get("usuario_rol") or "Operario").strip()
        nota_personal = (form.get("nota_personal") or "").strip()

        payload = {
            "categoria": form.get("categoria", "cultivo"),
            "identificador": form.get("identificador"),
            "producto": form.get("producto"),
            "unidad_area": form.get("unidad_area", "ha"),
            "area": form.get("area", 1),
            "temp": form.get("temp", 26),
            "radiacion": form.get("radiacion", 650),
            "humedad": form.get("humedad", 70),
            "lluvia_mm": form.get("lluvia_mm", 0),
            "cantidad": form.get("cantidad", 1),
            "peso": form.get("peso", 0),
            "largo": form.get("largo", 0),
            "proposito": form.get("proposito", "producción"),
            "foto_base64": form.get("foto_base64"),
        }
        api_key = form.get("api_key") or os.environ.get("GOOGLE_API_KEY")
        foto_bytes = request.files["foto"].read() if ("foto" in request.files and request.files["foto"].filename) else None

        historial_actual = cargar_historial()
        id_norm = (payload.get("identificador") or "").strip().upper()
        previos_id = [r for r in historial_actual if r.get("identificador") == id_norm]

        base = evaluar_animal(payload) if payload["categoria"] == "animal" else evaluar_cultivo(payload)
        ia_estructurada = estructurar_ia(
            base, previos_id, nota_personal=nota_personal, foto_bytes=foto_bytes, api_key=api_key
        )

        registro = {
            **base,
            "usuario": {"nombre": usuario_nombre, "rol": usuario_rol},
            "nota_personal": nota_personal,
            "ia": ia_estructurada,
            "foto_base64": payload.get("foto_base64"),
        }
        actualizado = agregar_registro(registro)
        return jsonify({"ok": True, "registro": registro, "historial": actualizado})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/api/historial", methods=["GET"])
def obtener_historial():
    return jsonify({"ok": True, "historial": cargar_historial()})


@app.route("/api/sync", methods=["POST"])
def sincronizar_offline():
    data = request.get_json(force=True) or {}
    pendientes = data.get("pendientes", [])
    historial = cargar_historial()
    ids_existentes = {r.get("local_id") for r in historial if r.get("local_id")}

    for item in pendientes:
        if item.get("local_id") and item.get("local_id") not in ids_existentes:
            historial.insert(0, item)

    guardar_historial(historial)
    return jsonify({"ok": True, "historial": historial})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)