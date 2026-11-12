# Sunpower Kontakty

Evidence kontaktů pro Sunpower: elektrikáři, instalatéři, pivovary a mlékárny. Pivovary a mlékárny jsou připravené jako prázdné sekce. Stavy zájmu: Má zájem, Velký zájem a Konečná domluva s postupně výraznější zelenou barvou.

## Spuštění a ověření

```sh
npm ci
npm run dev
npm test
npm run build
```

Volitelný prohlížečový test vyžaduje Playwright a Chromium mimo produkční závislosti. Proti lokálnímu serveru napodobuje GET/PUT API; nepřistupuje k databázi:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs
```

Lze nastavit `TEST_URL` a `PLAYWRIGHT_BROWSERS_PATH`. Test používá samostatný kontext prohlížeče.

## Hovory

Každý potvrzený záznam má vlastní ID, datum a čas, výsledek, poznámku a případný termín dalšího kontaktu. Tlačítko stavu otevře formulář; nic se nezapíše bez potvrzení. Telefonní odkaz otevře formulář s nepotvrzeným výsledkem „Zahájeno volání“. Záznam lze samostatně opravit nebo po potvrzení smazat. Historie je od nejnovějšího hovoru. Obecná poznámka kontaktu zůstává samostatná.

Přehled nabízí volání dnes, po termínu a v budoucnu podle místního kalendářního dne. Hovor pozdější než předchozí záznam vyřídí starší připomínku; nové datum se zadává v novém záznamu. Pouhé zahájení volání starší připomínku nevyřizuje. Nejsou externí notifikace ani automatické změny stavu při uplynutí termínu.

## Uložení a synchronizace

Server používá výhradně `SUNPOWER_DATABASE_URL` pro novou databázi. Klient používá nové úložiště `sunpower-contacts-neon-20261018-v1`; původní `sunpower-contacts-v4` nečte ani neodesílá. Při nedostupnosti serveru zobrazí chybu. Změny se odesílají po 700 ms, čtení probíhá po 15 sekundách pouze bez neuložených změn či otevřeného formuláře/importu. Rozpracovaný formulář se ukládá až potvrzením; při zavření stránky před potvrzením se koncept neuchovává.

Server vyžaduje `expectedUpdatedAt` s přesným textovým časem verze. Souběžná změna vrací HTTP 409 a místní data zůstávají zachovaná, včetně obnovení stránky. Tlačítko sloučení po výslovném potvrzení zálohuje obě kopie v prohlížeči a spojí historii; neprázdné místní údaje mají přednost. Každý úspěšný serverový zápis atomicky vytvoří předchozí úplnou kopii v tabulce `sunpower_backups`. Zálohy nemají automatickou expiraci.

Aplikace je podle zadání dostupná bez přihlášení. Neon Auth se nepoužívá. Staré klienty odmítá serverový protokol zápisu; nejde o autentizaci.

## Migrace a zálohy

Výchozí `public/contacts.json` zůstává beze změny. Jeho úplná kopie před úpravami je v `backups/contacts-before-history-2026-10-16.json`. Dokončená migrace je popsaná níže.

Při načtení starých dat se před aplikací migrace uloží kompletní JSON do localStorage pod klíčem obsahujícím `before-migration`. Bez úspěšné zálohy se migrace neaplikuje. Migrace doplní chybějící/duplicitní ID a historickou poznámku, zachová ostatní původní pole, počet kontaktů i původní historii. Příznak `historyMigrated` brání opakovanému vytváření poznámek, včetně záznamů později ručně smazaných. Migrace není změnou stavu nebo termínu kontaktu.

Tlačítko **Úplná JSON záloha** stáhne všechna pole včetně ID, historie a původních informací. CSV je pouze tabulkový export, nikoliv úplná záloha.

## Import

Podporován je JSON (úplná záloha či pole kontaktů), XLSX (první list) a CSV v UTF-8. Import rozpozná názvy interních polí i české sloupce například Firma / jméno, Telefon, Poznámka, Datum hovoru, Výsledek hovoru a Termín dalšího kontaktu. Vyžaduje jméno, telefon a skupinu `elektrikari`/`instalateri`/`pivovary`/`mlekarny`; chybějící skupina v tabulce se považuje za `elektrikari`. Datum přijímá ISO, český formát dne/měsíce/roku nebo číselné excelové datum.

Údaje hovoru vytvoří samostatnou historii. Před potvrzením je náhled počtu kontaktů a nových historických záznamů. Duplicity se porovnávají podle ID nebo posledních devíti číslic telefonu; standardně se přeskočí. Sloučení se povoluje zaškrtávacím políčkem a zachovává původní historii. Prázdné údaje nenahrazují neprázdné. Před importem se uchová původní vstup i úplný aktuální stav v prohlížeči a stáhne se JSON záloha aktuálního stavu.

SheetJS 0.20.3 je instalováno z oficiální distribuce výrobce, nikoliv ze starého balíčku npm.

## Výchozí kontakty

`python3 build_contacts.py` znovu vytvoří `public/contacts.json` z CSV v nadřazené složce. Neaktualizuje existující databázová nebo místní data. Před takovým krokem exportujte úplnou zálohu.

## Nasazení a migrace 18. 10. 2026

Cíl: Vercel `vachuska1s-projects/kontakty_sunpower`, nový Neon `sweet-water-84423225`.
Původní `DATABASE_URL` se nemění; opravená verze používá samostatné tajemství `SUNPOWER_DATABASE_URL` pouze pro produkci. Starší neměnná nasazení novou proměnnou nepoužívají a zachovávají původní databázi.

Čerstvá úplná záloha je `backups/live-contacts-before-id-repair-2026-10-18-migration.json`, SHA-256 `d46af9e49c26ed3fe236ea7492aef59566df333616f404ae0c106ec5f0805eb2`. Import používá všech 178 kontaktů a 209 historických záznamů. Mění se pouze 14 prázdných ID; seed se nepoužívá. Jednorázový import odmítá neprázdnou cílovou databázi.

API odmítá staré PUT bez hlavičky `X-Sunpower-Write-Protocol: contacts-20261018-v1`, neplatná/prázdná/duplicitní ID a chybějící či zastaralou revizi. Hlavička není heslo a není určena jako ochrana před úmyslným zápisem. Staré místní úložiště zůstává zachováno pro případný ruční export, nová verze jej neobnovuje. GET nemění tabulky ani data.

Produkční kontrola používá pouze GET a read-only SQL, bez testovacích kontaktů. Zálohy, přístupové údaje a migrační skripty se do nasazení neposílají. Původní produkční nasazení pro případ rollbacku: `dpl_9roMXzmdP3DDbsm8PXEboKdhE2tP`.

## Aktualizace 12. 11. 2026

Doplněné sekce a stavy sdílejí definice v `lib/options.mjs`, včetně formulářů a importu. Nové sekce nepřidávají žádné výchozí kontakty. Soukromé zálohy v `backups/` se neodesílají na GitHub ani do nasazení; historické testy opravy ID vyžadují tyto místní soubory.
