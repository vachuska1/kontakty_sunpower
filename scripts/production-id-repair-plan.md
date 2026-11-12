# Připravená oprava ID – bez produkčního zápisu

Stav přípravy: 16. 10. 2026. Produkční endpoint byl načten pouze metodou GET.
Nebylo provedeno PUT, připojení k Neonu, nasazení ani obnova výchozích kontaktů do databáze.

## Ověřené artefakty

Cesty jsou relativní ke složce `Sunpower_Kontakty`.

- Úplná nezměněná HTTP odpověď: `backups/live-contacts-before-id-repair-2026-10-16.json`
  SHA-256: `b8f7c1af8a4e450a0ff47c18db36aac60e431f8b458adeebcd23b101a3185748`
- Samostatné pole kontaktů: `backups/live-contacts-array-before-id-repair-2026-10-16.json`
  SHA-256: `2f2d10a92eb57881bfdf506476d177c990eb71f1d44e47e0f2908d10c02f0a86`
- Kontrolní manifest: `backups/live-contacts-backup-manifest-2026-10-16.json`
- Připravená úplná odpověď po opravě ID: `backups/live-contacts-id-repair-prepared-2026-10-16.json`
  SHA-256: `9f818b7c2793fa499f298088e8a8d9352320ba8bde7ba243b11a59e1349493a6`
- Porovnání a stabilní mapování indexů na nová ID: `backups/live-contacts-id-repair-report-2026-10-16.json`

Zálohy obsahují osobní údaje a patří mimo veřejné `public/`; nejsou podkladem pro změnu `public/contacts.json`.

## Výsledek dry-run

| Kontrola | Před | Po |
| --- | ---: | ---: |
| Kontakty | 178 | 178 |
| Prázdná ID kontaktů | 14 | 0 |
| Duplicitní neprázdná ID | 0 | 0 |
| Vyplněné telefony | 178 | 178 |
| Vyplněné e-maily | 103 | 103 |
| Vyplněné hlavní poznámky | 56 | 56 |
| Kontakty s historií | 82 | 82 |
| Historické záznamy | 209 | 209 |

Porovnán každý klíč každého kontaktu, pořadí i metadata odpovědi. Jediné rozdíly jsou 14 polí `id` na indexech 164–177 (číslováno od nuly). Původních 164 neprázdných ID zůstává zachováno. Původní osmiřádkové historie 14 dotčených kontaktů zůstávají přesně stejné; případné určení správného vlastníka jednotlivých hovorů vyžaduje ruční prověření. Žádné domnělé poznámky ani nové historické záznamy se nevytvářejí.

`npm run repair:dry-run` pracuje pouze s lokálními zálohami a ověřuje jejich SHA-256. ID se deterministicky odvozují z hash zálohy a indexu kontaktu s kontrolou kolizí. Opakované spuštění se stejnými vstupy vytváří stejná ID a nezměněné artefakty. Skript odmítá jiné režimy než dry-run; produkční zápis záměrně není implementován.

## Nezbytné pořadí po výslovném souhlasu

1. **Příprava a servisní okno.** Získat výslovný souhlas jak k nasazení kompatibilní verze v režimu údržby, tak k následné produkční opravě ID. Nejprve na jednorázové testovací databázi ověřit transakci, zálohování a konflikt dvou zápisů. Neprovádět testy na živých kontaktech. Uživatelé nejprve exportují případné neodeslané místní změny a přestanou aplikaci používat; staré otevřené karty zavřou.
2. **Nejdříve zablokovat staré zapisující klienty.** Nasadit připravenou kompatibilní aplikaci s `SUNPOWER_WRITES_PAUSED=1`. Její PUT vrací 503 ještě před připojením k databázi; GET je čistě čtecí. Toto je nasazení a vyžaduje předchozí souhlas. Zablokovat také zápis ze všech starších a preview nasazení, která sdílejí živou databázi; přesměrování produkčního aliasu samo nestačí, pokud zůstává dostupná stará adresa. Není-li možné všechny takové zapisující klienty odstavit, nepokračovat v migraci. Počkat na dokončení požadavků staré verze a čtením ověřit stabilní obsah i verzi dat. Samotná dohoda o zavření karet nestačí: starý klient mohl každých 15 sekund odeslat celou starou kopii a vrátit opravená ID zpět.
3. **Čerstvá záloha.** V režimu pozastavených zápisů uložit novou úplnou odpověď a pole kontaktů do nových souborů (současné zálohy nepřepisovat), spočítat SHA-256 a zkontrolovat všechny invariance. Pro nový snímek lze použít `python3 -B scripts/backup-live.py --label NOVY-JEDINECNY-STITEK` (pouze GET), případný nový dry-run `node scripts/repair-empty-ids.mjs --dry-run --label NOVY-JEDINECNY-STITEK`. Zvolit shodný štítek složený jen z ASCII písmen, číslic, podtržítek a pomlček. Současná záloha je ověřený výchozí snímek, nikoliv záruka aktuálního stavu v budoucím servisním okně. Jestliže se kontakty jakkoliv změnily, zastavit se a připravit nový dry-run k odsouhlasení; nikdy nenahradit novější data dnešní kopií. Pokud se změnil jen `updatedAt`, zapsat novou přesnou verzi a zachovat již schválené mapování ID.
4. **Podmíněná transakční oprava.** Až po potvrzení aktuálního snímku provést samostatným schváleným databázovým postupem jednu transakci. Zamknout řádek `sunpower_state.id = 1` pro zápis; porovnat aktuální `contacts` JSONB s úplným schváleným předchozím polem a přesný `updated_at`. Při rozdílu rollback. Před změnou uložit celý původní řádek do trvalé zálohy v téže transakci. Každý ze 14 nových řetězců z reportu aplikovat pouze přes `jsonb_set(contacts, ARRAY[index::text, 'id'], to_jsonb(new_id), false)`. Neprovádět přepis celého pole klientskou kopií, nepoužívat obecnou migraci historie a nepoužívat staré veřejné PUT, které nekontroluje verzi. V transakci porovnat každé původní a výsledné pole kromě dotčených ID, včetně počtu 209 historických záznamů. Jediným provozním metadatem, které se musí při zápisu aktualizovat, je databázový `updated_at`; jinak by stávající klient s původní verzí mohl projít kontrolou souběžnosti. Metadata uložených záloh se nemění. Commit pouze při splnění všech kontrol.
5. **Čtecí ověření produkce.** Novým GET uložit výsledek do nové zálohy, potvrdit 178 kontaktů, 0 prázdných a 0 duplicitních ID, nezměněných 164 původních ID, 209 záznamů historie, nezměněné ostatní položky a pořadí. V případě nesouladu ponechat zápisy vypnuté; neobnovovat celou starou kopii naslepo.
6. **Zapnout opravenou aplikaci.** Teprve po úspěšné kontrole vypnout `SUNPOWER_WRITES_PAUSED` a aktivovat opravenou aplikaci. Její API odmítá staré zápisy bez `expectedUpdatedAt`, takže staré karty nemohou potichu přepsat opravu. Starší záznamy historie bez vlastních ID jsou validní; neprovádí se jejich hromadná změna. Každý nový nebo výslovně upravený hovor dostává vlastní ID. Serverová ani již uložená data se při pouhém načtení automaticky nemigrují; neznámá/starší místní kopie se nesmí automaticky odeslat. Kontakty s neplatnými ID jsou do schválené opravy pouze pro čtení.
7. **Závěrečný test se zvlášť schválenými testovacími kontakty.** Pořídit zálohu a se souhlasem založit dva jasně označené testovací kontakty. Ověřit různá ID, izolovanou úpravu jména, stavu a poznámky, dva samostatné hovory a obnovu stránky. Porovnat všechny původní kontakty před a po testu; žádný původní kontakt ani historie se nesmí měnit. Odstranit jen explicitně vytvořené testovací kontakty a zkontrolovat konečný stav. Importy XLSX/CSV do živých dat při tomto testu nespouštět.

Důvod změny pořadí oproti přímé migraci: nejprve je nutné serverově zastavit staré klienty, kteří při čtení a následné automatické synchronizaci přepisují celý seznam. Kompatibilní nasazení v režimu údržby samo neprovádí datovou migraci. Oprava nesmí být prováděna přes stávající nechráněný veřejný PUT ani klientské automatické migrace.

## Ověření a omezení

- Automatické testy jsou v `tests/contacts.test.mjs` a `tests/id-repair.test.mjs`.
- `tests/browser-id-repair.mjs` testuje všech 10 požadovaných scénářů na syntetických datech s napodobeným API, včetně staré historie bez ID, blokování opravy a starší místní kopie.
- `tests/browser.mjs` pokrývá předchozí scénáře hovorů, termínů, XLSX/CSV, úplného JSON exportu, konfliktů a offline režimu.
- Serverová transakce nebyla provedena ani ověřena na živém Neonu; produkční provedení musí respektovat výše uvedené zámky a čerstvý snímek.
- `/api/contacts` je veřejně dostupný. Přihlášení a oprávnění je nutné vyřešit v samostatném kroku; tato příprava je nezavádí.
