import json
import os
from datetime import datetime

DATA_DIR = "data"
DB_FILE = os.path.join(DATA_DIR, "historial.json")


def cargar_historial():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DB_FILE):
        return []
    with open(DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def guardar_historial(registros):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)


def agregar_registro(registro):
    historial = cargar_historial()
    if not registro.get("fecha"):
        registro["fecha"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    historial.insert(0, registro)
    guardar_historial(historial)
    return historial