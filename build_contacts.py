import csv
import hashlib
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path(__file__).resolve().parent / "public" / "contacts.json"


def plain(value):
    return "".join(
        char for char in unicodedata.normalize("NFD", value or "")
        if unicodedata.category(char) != "Mn"
    ).lower()


def status_for(row):
    result = plain(row.get("Výsledek hovoru", ""))
    if "nema zajem" in result:
        return "not-interested"
    if "ma zajem" in result:
        return "interested"
    if "nezveda" in result or "nebral" in result or "nedovol" in result:
        return "no-answer"
    if "neexist" in result or "neplat" in result or "nezname cislo" in result:
        return "invalid"
    if result or "kontaktovan" in plain(row.get("Stav", "")):
        return "callback"
    return "new"


def date_from(row):
    text = " ".join((row.get("Poznámka", ""), row.get("Ověřeno dne", "")))
    match = re.search(r"\b(\d{1,2})[.]\s*(\d{1,2})[.]\s*(20\d{2})\b", text)
    if not match:
        return ""
    day, month, year = map(int, match.groups())
    return datetime(year, month, day, 12, 0).isoformat()


def split_pdf_note(raw_note):
    """Oddělí původní importovaný text od poznámky vzniklé při hovoru."""
    if not raw_note.startswith("Původní PDF:"):
        return raw_note, ""
    date = re.search(r"\b\d{1,2}[.]\s*\d{1,2}[.]\s*20\d{2}\b", raw_note)
    agreement = raw_note[date.end():].strip(" ,-–") if date else ""
    return agreement, raw_note


def location_from_pdf(raw_note):
    """Načte PSČ a obec, pokud jsou v původním textu zřetelně uvedeny."""
    text = raw_note.removeprefix("Původní PDF:").strip()
    matches = list(re.finditer(r"\b(\d{3})\s*(\d{2})\s+", text))
    if not matches:
        return "", ""
    match = matches[-1]
    rest = text[match.end():]
    city = re.split(
        r"(?=\s+[\w.+-]+@[\w.-]+)|(?=\s+(?:\+?420\s*)?[67]\d{8}\b)|(?=\s+\d{1,2}[.]\s*\d{1,2}[.]\s*20\d{2}\b)",
        rest,
        maxsplit=1,
    )[0].strip(" ,-")
    return f"{match.group(1)} {match.group(2)}", city


def load(filename, contact_type):
    with (ROOT / filename).open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    contacts = []
    for row in rows:
        raw_note = row.get("Poznámka", "").strip()
        agreement, source_info = split_pdf_note(raw_note)
        parsed_postal, parsed_city = location_from_pdf(raw_note) if source_info else ("", "")
        seed = "|".join((contact_type, row.get("Telefon", ""), row.get("Firma / jméno", "")))
        status = status_for(row)
        called_at = date_from(row) if status != "new" else ""
        contact = {
            "id": hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16],
            "type": contact_type,
            "name": row.get("Firma / jméno", "").strip(),
            "profession": row.get("Profese", "").strip(),
            "phone": row.get("Telefon", "").strip(),
            "email": row.get("E-mail", "").strip(),
            "city": row.get("Město / obec", "").strip() or parsed_city,
            "district": row.get("Okres", "").strip(),
            "services": row.get("Služby", "").strip(),
            "ico": row.get("IČO", "").strip(),
            "verification": row.get("Úroveň ověření", "").strip(),
            "source": row.get("Veřejný zdroj", "").strip(),
            "verifiedAt": row.get("Ověřeno dne", "").strip(),
            "status": status,
            "calledAt": called_at,
            "interest": row.get("O co má zájem", "").strip(),
            "followUp": row.get("Termín dalšího kontaktu", "").strip(),
            "note": agreement,
            "sourceInfo": source_info,
            "priority": row.get("Priorita", "").strip(),
            "history": [],
        }
        if status == "new" and contact["note"]:
            extra_info = f"Importní informace: {contact['note']}"
            contact["sourceInfo"] = "\n".join(filter(None, (contact["sourceInfo"], extra_info)))
            contact["note"] = ""
        city_from_name = {
            "Josef Hron, Kardašova Řečice": "Kardašova Řečice",
            "Instalatérství Prokš CB": "České Budějovice",
            "ServisCB - Instalatér & Topenář České Budějovice serviscb@seznam.cz": "České Budějovice",
        }
        contact["city"] = contact["city"] or city_from_name.get(contact["name"], "")
        # Záznam z původního PDF měl službu a celou adresu omylem v názvu.
        if "734765600" in re.sub(r"\D", "", contact["phone"]):
            contact.update({
                "name": "Elektrikářské a výkopové práce",
                "profession": "Elektrikář",
                "services": "Elektrikářské a výkopové práce",
                "address": "Hvožďany 30",
                "city": "Vodňany",
                "postalCode": "389 01",
                "district": "Strakonice",
            })
        else:
            contact["address"] = row.get("Adresa", "").strip()
            contact["postalCode"] = row.get("PSČ", "").strip() or parsed_postal
        if status != "new":
            contact["history"].append({
                "at": called_at or datetime.now().isoformat(),
                "status": status,
                "note": row.get("Výsledek hovoru", "").strip() or "Dříve kontaktován",
            })
        contacts.append(contact)
    return contacts


contacts = load("google_sheets_elektrikari.csv", "elektrikari")
contacts += load("google_sheets_instalateri.csv", "instalateri")
OUTPUT.write_text(json.dumps(contacts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Vytvořeno {OUTPUT}: {len(contacts)} kontaktů")
