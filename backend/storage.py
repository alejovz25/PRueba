import json
import os
from datetime import datetime

DATA_DIR = "data"
DB_FILE = os.path.join(DATA_DIR, "historial.json")
USERS_FILE = os.path.join(DATA_DIR, "usuarios.json")


def _leer_json(ruta, defecto):
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(ruta):
        return defecto
    with open(ruta, "r", encoding="utf-8") as f:
        return json.load(f)


def _guardar_json(ruta, datos):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)


def cargar_usuarios():
    default_users = [
        {"id": "admin", "nombre": "Administrador General", "rol": "Administrador"},
        {"id": "tecnico1", "nombre": "Técnico Agropecuario", "rol": "Técnico"},
        {"id": "operario1", "nombre": "Operario de Campo", "rol": "Operario"},
    ]
    return _leer_json(USERS_FILE, default_users)


def registrar_usuario(nombre, rol):
    usuarios = cargar_usuarios()
    uid = f"user_{len(usuarios)+1}_{nombre.lower().replace(' ', '_')}"
    nuevo = {"id": uid, "nombre": nombre.strip(), "rol": rol.strip()}
    usuarios.append(nuevo)
    _guardar_json(USERS_FILE, usuarios)
    return usuarios, nuevo


def cargar_historial():
    return _leer_json(DB_FILE, [])


def guardar_historial(registros):
    _guardar_json(DB_FILE, registros)


def agregar_registro(registro):
    historial = cargar_historial()
    if not registro.get("fecha"):
        registro["fecha"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    historial.insert(0, registro)
    guardar_historial(historial)
    return historial