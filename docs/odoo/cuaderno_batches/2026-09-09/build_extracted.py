#!/usr/bin/env python3
"""Build extracted.json from page transcriptions (cuaderno 2026-09-09).

Images were not available on the cloud VM; rows come from the plan-chat
vision transcriptions of RECTIFY_IMG_20260909_*.jpg.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

OUT = Path(__file__).resolve().parent


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s.casefold().strip())


def carrier_canonical(raw: str | None, address: str | None = None) -> str | None:
    if not raw:
        return None
    t = fold(raw)
    addr = fold(address or "")
    if "envia" in t and "inter" in t:
        if "inter" in addr or "oficina" in addr:
            return "Interrapidísimo"
        return "Envía"
    mapping = [
        ("inter", "Interrapidísimo"),
        ("envia", "Envía"),
        ("moto", "Moto"),
        ("mensajero", "Mensajero"),
        ("carro", "Carro"),
        ("terminal", "Terminal"),
        ("guaviare", "Terminal"),  # rare; treat as review later if needed
    ]
    for key, canon in mapping:
        if key in t:
            return canon
    return None


def D(name, address=None, carrier=None, date=None, so=None, qty=None, conf=0.85, review=False, **extra):
    row = {
        "raw_name": name,
        "so_number": so,
        "address": address,
        "carrier_raw": carrier,
        "carrier_canonical": carrier_canonical(carrier, address) if carrier else None,
        "qty_note": qty,
        "date": date,
        "confidence": conf,
        "needs_review": review or conf < 0.7,
    }
    row.update(extra)
    return row


def P(name, so, qty=None, date=None, conf=0.9, review=False):
    return D(name, so=so, qty=qty, date=date, conf=conf, review=review, page_type="packing")


# --- Per-page rows from transcriptions ---

PAGES = {}

PAGES["p01_160223"] = {
    "page_id": "p01_160223",
    "page_type": "delivery",
    "date_headers": ["03/09/25", "04/09/25", "05/09/25", "07/09/25"],
    "rows": [
        D("Jairo Enrique", "Mza E casa 15", "Envia", "03/09/25"),
        D("Nuevo Milenio", "conjunto el club torre 3", "Envia", "03/09/25"),
        D("Los 2 Paquetes", "Apto 807", None, "03/09/25", review=True, conf=0.5),
        D("Wolves", "cra 28 # 24-41", "inter", "03/09/25"),
        D("Rosa rebelde", "K 56A 38-31", None, "04/09/25", review=True, conf=0.5),
        D("Camilo Villadiego", "conjunto residencial Milano", "Envia", "04/09/25"),
        D("Ricardo Palenqueros", "cra 6B # 9-65", "Envia", "04/09/25"),
        D("Alianza", "Oficina de tulua", "inter", "04/09/25"),
        D("Javier colegio", "sale en", "Moto", "04/09/25"),
        D("Los salchis", "sale en", "Moto", "04/09/25"),
        D("Pao basket", "Norcasia - caldas", "Moto", "04/09/25"),
        D("Marco Guainia", "calle 14 # 12a 41", "Mensajero", "04/09/25"),
        D("Manuel UdeA", "Calle 56A 55-15", "Envia", "04/09/25"),
        D("Carnes Nachito", "Calle 5 10a 16", "Envia", "04/09/25"),
        D("Mixeros", "Kilometro 6", "Envia", "04/09/25"),
        D("Cristian Victoria", "sale en", "Moto", "05/09/25"),
        D("Leonardo Leiva", "sale en", "Moto", "05/09/25"),
        D("Jota ardila", "cra 5A # 14-57", "inter", "07/09/25"),
        D("Juliana U", "Cll 3 # 4-9", "inter", "07/09/25"),
        D("Eduardo chala", "Oficina prin", "inter", "07/09/25"),
        D("Antony", "sale en", "Moto", "07/09/25"),
        D("Pitbulls", "cll 5 # 6-24", "Envia", "07/09/25"),
        D("Hamicor", "cll 7 # 3a-42", "Envia", "07/09/25"),
        D("Sergio Gualpa", "cll 55 N # 22-80", "inter", "07/09/25"),
        D("Laura Palacios", "cra 29 # 21-28", "Envia", "07/09/25"),
        D("Alejandro", "cra 92 # 92-2", "Envia", "07/09/25"),
        D("Ramplita", "cra 6 Sur # 17-15", "Envia", "07/09/25"),
    ],
}

PAGES["p02_160313"] = {
    "page_id": "p02_160313",
    "page_type": "delivery",
    "date_headers": ["20/08/26", "21/08/26", "24/08/26", "25/08/26"],
    "rows": [
        D("Coratonista Milan", "don javier Neva. cra 8 80-22 altos del johar", "Carro", "20/08/26", conf=0.75),
        D("Rafa Si marca", "cra. 25 A # 8A - 29", "Envia inter", "20/08/26"),
        D("Billy", "cll 10 # 9-05", "inter", "20/08/26"),
        D("Edwin escobar", "Oficina princ inter", "inter", "20/08/26"),
        D("Carlos Yamil", "terminal - cartagena", "Mensajero", "21/08/26"),
        D("Jaime Quiroga", "ciudad = Vélez", "Mensajero", "21/08/26"),
        D("Nidia Daza", "inter - oficina princ", "inter", "21/08/26"),
        D("Champions", "cll 5 # 8-50", "Envia", "21/08/26"),
        D("Valeroy", "Pedro Salazar - cartagena", "Envia", "21/08/26"),
        D("Daniel Tovar", "cll 81 # 7d - 24", "Envia", "21/08/26"),
        D("Suba futbolera", "si javier envio.", "Moto", "21/08/26"),
        D("Arbol Guerrero", "cll 27 # 9-39", "inter", "21/08/26"),
        D("José Pamplona", None, "Mensajero", "21/08/26", conf=0.7),
        D("Guaviare beach soccer", None, "Moto", "21/08/26", conf=0.7),
        D("Andrea triatlon", None, "inter", "21/08/26", conf=0.7),
        D("Carlos Mario Gonzalez", "sede principal inter", "inter", "21/08/26"),
        D("Stefany Sena", None, "inter", "21/08/26"),
        D("Colusa", "cra 21 b # 8c - 160", "Moto", "21/08/26"),
        D("Isa Puma", None, "Envia", "24/08/26"),
        D("Lopez Paisa", None, "inter", "24/08/26"),
        D("Carolina Vallejo", None, "Envia", "24/08/26"),
        D("Pibes", None, "Envia", "24/08/26"),
        D("Futbolístico club", None, "Envia", "24/08/26"),
        D("Raul Yerro", None, "Envia inter", "24/08/26"),
        D("Stefany", None, "Envia inter", "24/08/26", conf=0.7, review=True),
        D("Tania Keyner", None, "inter", "24/08/26"),
        D("Yey", "Oficina principal inter", "inter", "24/08/26"),
        D("Hamilton Lopez", None, "inter", "24/08/26"),
        D("Muestra sta pao", "Rafael Martinez cll 32 # 50 a - 38", "Envia", "25/08/26"),
    ],
}

PAGES["p03_160341"] = {
    "page_id": "p03_160341",
    "page_type": "delivery",
    "date_headers": ["04/08/26", "06/08/26"],
    "rows": [
        D("Sebastian vidal", "Cra 46 # 48-50 Edificio Portal de Asturias / Apto 106", "Envia", "04/08/26"),
        D("July", "cra 1 # 4-68 piso 2 frente al estadio pácora - caldas", "inter", "04/08/26"),
        D("Angy Perez", "cra 7 a # 9-04 - tierra alta córdoba", "Envia inter", "04/08/26"),
        D("Profe Hugo", "La hormiga - Putumayo oficim princ", "inter", "04/08/26"),
        D("Royal", "Se envía", "Moto", "04/08/26"),
        D("Angel cupiño", "Se envía", "Moto", "04/08/26"),
        D("Antonio Nariño", "Se envía", "Moto", "04/08/26"),
        D("Diamantes del pacifico", "Cra 26 L # 44-50 piso 2", "Envia", "04/08/26"),
        D("Alianza TC", None, "Envia", "06/08/26", conf=0.7),
    ],
}

PAGES["p04_160229"] = {
    "page_id": "p04_160229",
    "page_type": "delivery",
    "date_headers": ["29/08/26", "31/08/26", "01/09/26", "02/09/26"],
    "rows": [
        D("Desiaval", "cll 6 # 8 - 11", "inter", "29/08/26"),
        D("Crismath Academy", "Cll 46 # 109 - 39", "Envia inter", "29/08/26"),
        D("Pasto", "sale en supao", "Carro", "31/08/26"),
        D("Dummer", "oficina Prin inter", "inter", "31/08/26"),
        D("Echeverri", "El bagre", "inter", "31/08/26"),
        D("ibeth Vargas", "Diagonal 38 # 18 - 135", "Envia", "31/08/26"),
        D("jhonatan", "cll 6 # 9 - 128", "inter", "31/08/26"),
        D("carlos Andres", "cra 4 # 8 - 33", "inter", "31/08/26"),
        D("Amigos Poker", "cll 22 # 22 - 55", "Envia", "31/08/26"),
        D("Lins", "cra 24 # 8 - 91", "inter", "31/08/26", qty="los dos pedidos / 10 polos"),
        D("Maricela", "Transportadora", "Guaviare", "01/09/26", review=True, conf=0.6),
        D("Mafe idu", "Sale", "Moto", "01/09/26"),
        D("Sin Frontera", "cra 11 64 N - 50", "Envia", "01/09/26"),
        D("Talel", "cll 31 E 80D - 70", "Envia", "01/09/26"),
        D("Cau", "Av. los bucaros # 60 - 319", "Envia", "01/09/26"),
        D("Fenix Natagaima", "cra 3 # 9 - 49", "inter", "01/09/26"),
        D("Chelsea", "oficina prin inter", "inter", "01/09/26"),
        D("William", "cll 29k # 30 - 20", "Envia", "01/09/26"),
        D("colombo argentina", "villa pinzon", "mensajero", "02/09/26"),
        D("Yadira", "cra 4 # 25 - 47", "inter", "02/09/26"),
        D("Pablo Ocampo", "oficina prin inter", "inter", "02/09/26"),
        D("Risas", "cra 61 cll 45B - 09", "inter", "02/09/26"),
        D("Uraba", "cll 82 a # 100 - 54", "Envia", "02/09/26"),
        D("Corporación Mayorca", "cll 62A # 67B - 28", "Envia", "02/09/26"),
        D("Lulu", "cra 100 38a 15", "Envia", "02/09/26"),
        D("Diaz granados", "cll 28 d # 21a - 45", "Envia", "02/09/26"),
    ],
}

PAGES["p05_160320"] = {
    "page_id": "p05_160320",
    "page_type": "mixed",
    "date_headers": ["14/08/26", "15/08/26", "18/08/26", "19/08/26"],
    "rows": [
        D("Eduardo", "cll 2 # 7a - 17", "inter", "14/08/26"),
        D("Juan Diego", "cra 8z a # 32 a - 310", "Envia", "14/08/26"),
        D("Nuevo milenio", "conjunto el club torre 3 Apto 807", "Envia", "14/08/26"),
        D("Jeison cantera", "cra 10 # 7 - 14", "Envia", "14/08/26"),
        D("Suleima", "Oficina principal inter", "inter", "14/08/26"),
        D("Jauria", "cll 35 a # 43 a - 67 Yopal", "inter", "15/08/26"),
        D("Haviarroyo", "Cra 44 cll 5 casa 44", "inter", "15/08/26"),
        D("Jhon in lac", "Terminal, florencia", "Terminal", "15/08/26"),
        D("universidad del choco", "Terminal Medellin", "Terminal", "15/08/26", so=2839),
        D("universidad Deportes choco", "Terminal Medellin", "Terminal", "15/08/26", so=2849),
        D("Jaime B.S", "Moto envio", "Moto", "15/08/26", so=2777),
        D("German Padilla", "Oficina inter - santamarta", "inter", "15/08/26"),
        D("chocó - unif de Presentación", "cl 44 # 44 - 66", "Envia", "18/08/26", conf=0.7),
        D("Leonardo Ortiz", "cra 0 cll 11 Barrio - La magdalena", "inter", "18/08/26"),
        D("Alejandro borrero", "Km 5 via sopa Parcelación", "inter", "18/08/26"),
        D("Mauro", "Medellín", "Mensajero", "18/08/26"),
        D("Samuel Cortes", "Lérida - tolima", "inter", "18/08/26"),
        D("Cortínez", "Medellin", "Mensajero", "19/08/26", qty="4 Adicionales"),
        D("David", "Oficina prin inter", "inter", "19/08/26"),
        D("Pedro rapimertar", "Manz E casa 113", "inter", "19/08/26"),
        D("Yesica Abello", "cll 14 # 3 - 39", "Envia", "19/08/26"),
    ],
}

PAGES["p06_160236"] = {
    "page_id": "p06_160236",
    "page_type": "delivery",
    "date_headers": ["26/08/26", "27/08/26", "28/08/26"],
    "rows": [
        D("Arnold juntas", "Oficina prin inter", "inter"),
        D("Yuneidys", "Oficina Prin inter", "inter"),
        D("Alcira", "cll 2 # 4-44", "inter"),
        D("clud voleibol", "cll 5 # 4-30", "Envia"),
        D("Diomer", "cra 14 # 8-30", "inter"),
        D("Oscar flores", "Oficina Prin inter", "Envia"),
        D("Cristian Arnedo", "cll 14 # 19-14", "inter"),
        D("Jaime cabarcas", "cra 10 cl 9-409P", "inter"),
        D("Tefa Leyes", "cra 4 # 30 - 90", "Envia", "26/08/26"),
        D("U. H. G. M", "Cra 67 # 8-25", "Envia", "26/08/26"),
        D("The King", "cll 109 # 12-136", "inter", "26/08/26"),
        D("Aceros", "Oficina prin inter", "inter", "26/08/26"),
        D("Campaz", "Cra 38 4 sur 20", "Envia", "26/08/26"),
        D("Jenni", "cra 14 B 8 sur 40", "Envia", "26/08/26"),
        D("Nathis", "cra 52 # 100 - 213", "Envia", "26/08/26"),
        D("Happy Kids", "M1h Lore 46 - Sector Bolivar", "Envia", "26/08/26"),
        D("Juli fucsia", "Oficina Prin inter", "inter", "26/08/26"),
        D("Bolsos unif y cam", "cra 47 # 10 sur 50", "inter", "26/08/26", conf=0.65, review=True),
        D("Felipe fabriplacas", "Oficina Princ inter", "inter", "27/08/26"),
        D("Stefa el cedral", "Prin inter", "inter", "27/08/26"),
        D("Gustavo Asprilla", "cra 16 # 3-64", "Envia", "27/08/26"),
        D("Sueños Dorados", "cra 48 64-09 R.0", "inter", "27/08/26"),
        D("Cortinez", None, "inter", "27/08/26"),
        D("Puchungitos", "cll 7 # 11B - 85", "inter", "27/08/26"),
        D("Jhon oni del carmen", "Oficina prin inter", "inter", "27/08/26"),
        D("Carlos G", "Oficina Princ inter", "inter", "27/08/26"),
        D("Arelyn retorno", "cll 7 # 9 - 65", "Envia inter", "28/08/26"),
        D("Mery arboleda", "cll 75 20 81 L76 P1", "inter", "28/08/26"),
        D("Universidad chocó", "cll 24 a # 7e - 26", "inter", "28/08/26"),
        D("Alvaro cabarcas", "cll 7 # 7A - 16", "Envia", "28/08/26"),
        D("Duvier Acosta", "Oficina Prin inter", "inter", "28/08/26"),
    ],
}

PAGES["p07_160143"] = {
    "page_id": "p07_160143",
    "page_type": "delivery",
    "date_headers": ["08/09/26", "09/09/26"],
    "rows": [
        D("Sully", "Cra 9 # 18-32", "inter"),
        D("Eduarnier", "Oficina prin inter", "inter"),
        D("Stéfany Pantagoras", "Cra 3 # 1-57", "inter", "08/09/26"),
        D("Yolfer", "Cra 9 # 16-70", "inter", "08/09/26"),
        D("Cacher", "Calle 35 # 23-62 Uribe", "envia", "08/09/26"),
        D("Emily Zuluaga", "Cra 420 # 45 B Sur 198", "envia", "08/09/26"),
        D("Simón", "Calle 35 # 58-10", "envia", "08/09/26"),
        D("Laura San juan", "Sale Sra Pao", "Moto", "09/09/26"),
        D("Juliana Vélez", "cra 55 # 56-42", "inter", "09/09/26"),
        D("Daniel Conde", "cra 49 cll 25 y 26", "inter", "09/09/26"),
        D("Natural Zone", "cra 10 # 1-15", "Envia", "09/09/26"),
        D("Suave y Sabor", "cll 5 # 5-59", None, "09/09/26", review=True, conf=0.5),
        D("Sabor y suave", None, "inter", "09/09/26", conf=0.65, review=True),
        D("Jac", "Cra 7 # 5-39", "inter", "09/09/26"),
    ],
}

PAGES["p08_160438"] = {
    "page_id": "p08_160438",
    "page_type": "packing",
    "date_headers": ["08/09/26", "09/09/26"],
    "packer": "Valentina H",
    "rows": [
        P("Jerilyn Rojas", 3039, "168 cam", "08/09/26"),
        P("Almeria FC", 3102, "19 unif", "08/09/26"),
        P("Abello Yesica", 3144, "5 unit", "08/09/26"),
        P("Mateo Diamante", 3076, "9 cam", "08/09/26"),
        P("Bagre Yilibert", 3121, "18 unit", "08/09/26"),
        P("Jheyson Zea Adicional", 3173, "6 unit y 1 cam", "08/09/26"),
        P("Leidy Vargas", 3038, "27 unit, 2 cam", "09/09/26"),
        P("Duverney", 3079, "9 unit", "09/09/26"),
        P("Yazz", 3170, "9 cam", "09/09/26"),
        P("Luisa peñaloza", 3146, "10 cam", "09/09/26"),
        P("Melisa Romero", 3075, "8 unit, 1 cam", "09/09/26"),
        P("Sarah", 3169, "14 unit", "09/09/26"),
        P("Cathe - Kapso", 3135, "19 cam", "09/09/26"),
        P("Laura San juan", 3073, "11 unit", "09/09/26"),
        P("La margarita - Jesus", 3078, "7 unit", "09/09/26"),
        P("Jenni", 3145, "60 cam", "09/09/26"),
        P("Julio Cesar", 3080, "28 unit", "09/09/26"),
    ],
}

PAGES["p09_160426"] = {
    "page_id": "p09_160426",
    "page_type": "packing",
    "date_headers": ["03/09/26", "04/09/26", "05/09/26", "07/09/26"],
    "rows": [
        P("CBI Rio sucio", 3046, "7 unif, 1 cam, 1 tula"),
        P("Fortaleza omar", 3045, "64 unif, 1 cam, 1 pant"),
        P("Hector Morales", 3008, "3 chaq, 21 unif"),
        P("Wolves", 2930, "5 unif, 5 cam"),
        P("Guaridolo sudaderas", None, "16 sudaderas", "03/09/26", review=True, conf=0.5),
        P("Marco Guainía", 3028, "25 unif", "03/09/26"),
        P("Stefany Pantagoras", 3006, "37 unif, 3 cam", "03/09/26"),
        P("Jota ardilla Voley", 3052, "19 cam", "03/09/26"),
        P("Jasibe O", 3090, "14 cam", "03/09/26"),
        P("Leonardo Leiva", 3025, "20 unif", "03/09/26"),
        P("Bacata FC", 3026, "19 unif, 8 cam, 1 chaq", "04/09/26"),
        P("Leonardo Leiva", 3025, "20 unif", "04/09/26"),  # duplicate date note
        P("Trapitos", 3100, "12 unif", "04/09/26"),
        P("Tomas Heredia", 3013, "9 unif", "04/09/26"),
        P("Sergio Gualpa", 3061, "9 unif", "04/09/26"),
        P("Anthony", 3049, "12 cam", "04/09/26"),
        P("Brayan ws", 3062, "8 unif", "04/09/26"),
        P("Mao Pedido 2", 3009, "12 unif, 9 cam", "04/09/26"),
        P("Yolfer", 2987, "20 cam, 8 cam corta", "04/09/26"),
        P("Bron", 3024, "25 unif, 3 cam", "05/09/26"),
        P("Francisco", 3108, "17 unif", "05/09/26"),
        P("Los Playeros", 3110, "10 unif", "05/09/26"),
        P("Tom Maestros", 3027, "13 unif", "05/09/26"),
        P("Edwin Escobar", 3010, "30 unif", "05/09/26"),
        P("Pedro rapimerkar", 3117, "28 unif, 4 cam", "05/09/26"),
        P("(blank red)", 3039, "45 cam", "07/09/26", review=True, conf=0.7),
        P("Jerelyn rojas", 3098, "61 unif, 37 cam", "07/09/26"),
        P("Kate", 3077, "12 cam", "07/09/26"),
        P("Eduamier", None, None, "07/09/26", review=True, conf=0.4),
    ],
}

PAGES["p10_160350"] = {
    "page_id": "p10_160350",
    "page_type": "delivery",
    "date_headers": ["31/07/26", "01/08/26", "03/08/26"],
    "rows": [
        D("William", "cll 29 K#30-10 Barrio = Santa Ana - Santa Marta", "Envia", "31/07/26"),
        D("Happy kids", "Msh Lora 45 - sector bolivar Barrio: Villas de Aranjuez", "Envia", "31/07/26"),
        D("Zions", "Oficina princ. del parque", "inter", "31/07/26"),
        D("Camilo flórez", "Oficina Princ. inter Sede las delicias", "inter", "31/07/26"),
        D("Hermes Manzano", "Calle #4 871 Cerrito Valle", "Envia", "31/07/26"),
        D("Juan E. Londoño", "Cra 24c #41 Sur 127 apt 105", "Envia", "31/07/26"),
        D("Cobari", "Rio Sucio - Caldas", "Moto", "31/07/26"),
        D("Melisa Murillo", "cll 98a 12 A - 26 turbo", "inter", "31/07/26"),
        D("Orlando Hooker", "Via san luis diagonal defensoria del pueblo", "Envia", "31/07/26"),
        D("Mari fan Mueses", "Oficina Princ. Putumayo", "inter", "31/07/26"),
        D("Yursen Bolivia", "Se envía", "Moto", "01/08/26"),
        D("Emirates", "Oficina princ. inter - Caldas", "inter", "01/08/26"),
        D("Steven Voleibol", "Cra 3 #9-49 Pensilvania", "inter", "01/08/26"),
        D("Felipe Toro", "Primero de mayo - Sale en", "Moto", "01/08/26"),
        D("Juan esteban", "Se envía", "Moto", "01/08/26"),
        D("Nicolas Ayala", "Se envía - sr Javier", "Moto", "01/08/26"),
        D("Andres Martin", "Se envía - sr Javier", "Moto", "01/08/26"),
        D("Fortaleza omar", "Oficina Princ de inter la Ceibas", "inter", "03/08/26"),
        D("Laura Palacios", "Cra 2g #21-28 - Puerto Gaitán", "inter", "03/08/26"),
    ],
}

PAGES["p11_160335"] = {
    "page_id": "p11_160335",
    "page_type": "delivery",
    "date_headers": ["10/08/25", "11/08/25", "12/08/25", "13/08/25"],
    "rows": [
        D("Eliah", None, None, qty="sale 3 unit", review=True, conf=0.5),
        D("Yiduar", None, "Envia", conf=0.7),
        D("Santiago Warrios", None, "inter", conf=0.7),
        D("Petos Marcos", None, "Envia", conf=0.7),
        D("Suba futbolera", None, "Moto", conf=0.7),
        D("Renegados", None, "Envia", "10/08/25"),
        D("Juan Mendoza", None, "inter", "10/08/25"),
        D("Jauria Wilmar", None, "inter", "10/08/25"),
        D("Jesus enrique", "Oficina principal inter", "inter", "10/08/25"),
        D("Miguel nuñez", None, "Envia", "10/08/25"),
        D("Juan carlos gallo", None, "Envia", "10/08/25"),
        D("Edison cortez", None, "inter", "10/08/25"),
        D("Gabriel Mosquera", None, "Envia", "11/08/25"),
        D("Claudia G", None, "inter", "11/08/25"),
        D("Manuel orozco", None, "Envia", "11/08/25"),
        D("Atlético paraíso", None, "inter", "11/08/25"),
        D("Fernando XXI", None, "Envia", "11/08/25"),
        D("Samuel romero", None, "inter", "12/08/25"),
        D("Velma", "Reclamar en Oficina Envia", "Envia", "12/08/25"),
        D("Yhory acuña", None, "inter", "12/08/25"),
        D("Casa del maestro", None, "Envia", "12/08/25"),
        D("Cristian torres", None, "inter", "13/08/25"),
        D("Super servicios", None, "Envia", "13/08/25"),
    ],
}


def annotate_page(page: dict) -> dict:
    rows = []
    for r in page["rows"]:
        rr = dict(r)
        rr["page_id"] = page["page_id"]
        if rr.get("so_number") is not None and page["page_type"] == "packing":
            rr["case"] = "packing"
        elif rr.get("so_number") is not None and page["page_type"] == "mixed":
            # Mixed page: number => also packing signal, but carrier present => delivery with SO
            rr["case"] = "delivery_with_so"
        elif rr.get("carrier_raw") or rr.get("carrier_canonical"):
            rr["case"] = "delivery"
        else:
            rr["case"] = "review"
            rr["needs_review"] = True
        rows.append(rr)
    out = dict(page)
    out["rows"] = rows
    return out


def reconcile(pages: dict) -> dict:
    packing_rows = []
    delivery_rows = []
    review_rows = []

    seen_so = {}
    for pid, page in pages.items():
        ap = annotate_page(page)
        for r in ap["rows"]:
            case = r["case"]
            if case == "packing" and r.get("so_number") is not None:
                so = int(r["so_number"])
                if so in seen_so:
                    # keep first; mark duplicate
                    review_rows.append({**r, "reason": f"duplicate_so_of_{seen_so[so]}"})
                else:
                    seen_so[so] = r["page_id"]
                    packing_rows.append(r)
            elif case == "delivery_with_so":
                # SO on a delivery page only helps name-match for validate — not Empacado.
                delivery_rows.append(r)
            elif case == "delivery":
                delivery_rows.append(r)
            else:
                review_rows.append(r)

    # Dedupe delivery by fold(name)+carrier+date (keep highest confidence)
    dedup = {}
    for r in delivery_rows:
        key = (fold(r.get("raw_name") or ""), fold(r.get("carrier_canonical") or ""), r.get("date") or "")
        prev = dedup.get(key)
        if not prev or (r.get("confidence") or 0) > (prev.get("confidence") or 0):
            dedup[key] = r
    delivery_rows = list(dedup.values())

    return {
        "batch_id": "cuaderno_2026-09-09",
        "source_note": (
            "Extracted from plan-chat vision transcriptions of RECTIFY_IMG_20260909_*. "
            "Images were not present on the cloud VM; re-run extractors when pages/ is populated."
        ),
        "pages": {k: annotate_page(v) for k, v in pages.items()},
        "packing_rows": packing_rows,
        "delivery_rows": delivery_rows,
        "review_rows": review_rows,
        "counts": {
            "pages": len(pages),
            "packing": len(packing_rows),
            "delivery": len(delivery_rows),
            "review": len(review_rows),
            "packing_so_unique": len(seen_so),
        },
    }


def write_report(data: dict):
    lines = [
        "# Cuaderno 2026-09-09 — extracción",
        "",
        f"- Pages: **{data['counts']['pages']}**",
        f"- Packing (Empacado) rows: **{data['counts']['packing']}** (unique SO: {data['counts']['packing_so_unique']})",
        f"- Delivery rows: **{data['counts']['delivery']}**",
        f"- Review bucket: **{data['counts']['review']}**",
        "",
        "## Packing SO numbers",
        "",
    ]
    sos = sorted({int(r["so_number"]) for r in data["packing_rows"] if r.get("so_number") is not None})
    lines.append(", ".join(str(s) for s in sos))
    lines.extend(["", "## Delivery by carrier", ""])
    by_c: dict[str, int] = {}
    for r in data["delivery_rows"]:
        c = r.get("carrier_canonical") or "unknown"
        by_c[c] = by_c.get(c, 0) + 1
    for c, n in sorted(by_c.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- {c}: {n}")
    lines.extend(["", "## Review sample", ""])
    for r in data["review_rows"][:25]:
        lines.append(
            f"- [{r.get('page_id')}] {r.get('raw_name')} | so={r.get('so_number')} | "
            f"{r.get('carrier_raw')} | {r.get('reason') or r.get('case')}"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Extraction used transcriptions (no JPG on VM).",
            "- Apply script will dry-run against Odoo prod when credentials are available.",
            "",
        ]
    )
    (OUT / "report.md").write_text("\n".join(lines))


def main():
    # write per-page extractions
    ext_dir = OUT / "extractions"
    ext_dir.mkdir(parents=True, exist_ok=True)
    for pid, page in PAGES.items():
        (ext_dir / f"{pid}.json").write_text(
            json.dumps(annotate_page(page), ensure_ascii=False, indent=2)
        )
    data = reconcile(PAGES)
    (OUT / "extracted.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    write_report(data)
    print(json.dumps(data["counts"], indent=2))


if __name__ == "__main__":
    main()
