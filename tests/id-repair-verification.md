# Výsledek ověření 16. 10. 2026

- `npm test`: PASS, 9 automatických testů.
- `npm run repair:dry-run`: PASS, opakované spuštění zachovalo stejné artefakty a ID.
- `npm run build`: PASS, Next.js 16.4.2.
- `git diff --check`: PASS.
- `tests/browser-id-repair.mjs`: PASS na finálním lokálním sestavení s napodobeným API a syntetickými kontakty:
  1. Dva nové kontakty mají různá neprázdná ID.
  2. Úprava jednoho nezmění druhý.
  3. Změna stavu je izolovaná.
  4. Poznámka patří pouze vybranému kontaktu.
  5. Smazání jednoho neodstraní ostatní kontakty.
  6. Historické poznámky a úprava jednotlivého hovoru se nepřepisují navzájem.
  7. Rozepsaná poznámka a vybraný kontakt přežijí patnáctisekundový interval; polling je během formuláře pozastaven.
  8. XLSX i CSV vytvářejí neprázdná a unikátní ID.
  9. XLSX i CSV ve výchozím režimu přeskočí existující kontakty bez změny.
  10. Úplný JSON export odpovídá celému stavu včetně ID a historie.
- Další kontroly stejného testu: načtení serverových kontaktů neprovádí migraci ani PUT; staré historické záznamy bez ID se mění jen po výslovné editaci; kontakty s prázdnými ID jsou pro zápisy zablokované; starší místní kopie se proti novější serverové verzi automaticky neodesílá.
- `tests/browser.mjs`: PASS pro předchozí scénáře dvou hovorů, editace, reloadu, rozepsané poznámky, termínů dnes/po termínu, CSV/XLSX, JSON zálohy, konfliktu a offline režimu.
- SHA-256 obou živých záloh znovu ověřeno po dokončení testů.

Produkční endpoint byl použit pouze pro GET zálohu. Testy nepoužívaly živé API ani Neon. Produkční zápis, migrace a nasazení nebyly provedeny. Skutečná databázová transakce vyžaduje před produkčním provedením ověření na oddělené testovací databázi.
