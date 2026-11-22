import json
import os
from datetime import datetime
from werkzeug.security import check_password_hash, generate_password_hash

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
        {
            "id": "admin",
            "nombre": "Administrador General",
            "rol": "Administrador",
            "password_hash": generate_password_hash("admin123"),
        },
        {
            "id": "tecnico1",
            "nombre": "Técnico Agropecuario",
            "rol": "Técnico",
            "password_hash": generate_password_hash("tecnico123"),
        },
        {
            "id": "operario1",
            "nombre": "Operario de Campo",
            "rol": "Operario",
            "password_hash": generate_password_hash("campo123"),
        },
    ]
    if not os.path.exists(USERS_FILE):
        _guardar_json(USERS_FILE, default_users)
        return default_users
    return _leer_json(USERS_FILE, default_users)


def usuarios_publicos():
    return [
        {"id": u["id"], "nombre": u["nombre"], "rol": u["rol"]}
        for u in cargar_usuarios()
    ]


def verificar_login(nombre, password):
    nombre_limpio = (nombre or "").strip().lower()
    for u in cargar_usuarios():
        if u["nombre"].strip().lower() == nombre_limpio and check_password_hash(
            u.get("password_hash", ""), password or ""
        ):
            return {"id": u["id"], "nombre": u["nombre"], "rol": u["rol"]}
    return None


def registrar_usuario(nombre, rol, password):
    nombre_limpio = (nombre or "").strip()
    rol_limpio = (rol or "Operario").strip()
    if not nombre_limpio or not password or len(password) < 4:
        raise ValueError("Debes ingresar un nombre y una contraseña de al menos 4 caracteres.")

    usuarios = cargar_usuarios()
    if any(u["nombre"].strip().lower() == nombre_limpio.lower() for u in usuarios):
        raise ValueError("Ya existe un usuario con ese nombre.")

    uid = f"user_{len(usuarios)+1}_{nombre_limpio.lower().replace(' ', '_')}"
    nuevo_hash = generate_password_hash(password)
    nuevo = {
        "id": uid,
        "nombre": nombre_limpio,
        "rol": rol_limpio,
        "password_hash": nuevo_hash,
    }
    usuarios.append(nuevo)
    _guardar_json(USERS_FILE, usuarios)
    return usuarios_publicos(), {
        "id": nuevo["id"],
        "nombre": nuevo["nombre"],
        "rol": nuevo["rol"],
    }


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