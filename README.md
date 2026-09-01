# Sunpower Kontakty

Mobilní Next.js aplikace pro volání elektrikářům a instalatérům. Obsahuje 164 kontaktů z obou zdrojových CSV, barevné stavy, historii volání, poznámky, termín dalšího kontaktu, hledání, filtry a tabulkové zobrazení.

## Nasazení na Vercel

1. Přihlaste se na [vercel.com](https://vercel.com) a zvolte **Add New → Project**.
2. Nahrajte tuto složku přes GitHub, případně v terminálu v této složce spusťte `npx vercel`.
3. Vercel automaticky rozpozná Next.js. Build command je `npm run build`.

## Mobil

Otevřete adresu z Vercelu v telefonu. Na iPhonu použijte Safari → Sdílet → **Přidat na plochu**. Na Androidu Chrome → nabídka → **Přidat na plochu / Instalovat aplikaci**.

Telefonní číslo otevře běžné volání. Změny se průběžně ukládají přímo do daného zařízení. Tlačítko ⇅ slouží pro CSV zálohu, obnovení nebo přenos dat.

## Důležité k ukládání

Aplikace používá společnou Neon Postgres databázi, pokud je ve Vercelu dostupná proměnná `DATABASE_URL`. Bez ní automaticky přejde na místní ukládání v prohlížeči. Uživatelé se nepřihlašují; kdokoliv se znalostí adresy aplikace může data zobrazit a upravovat.

## Aktualizace kontaktů

Po změně zdrojových CSV spusťte ve složce aplikace:

```sh
python3 build_contacts.py
```

Pozor: volba **Obnovit původní data** v aplikaci zahodí místní změny a znovu načte `contacts.json`.
