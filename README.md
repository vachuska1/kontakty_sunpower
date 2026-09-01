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

Současná verze ukládá data v prohlížeči telefonu. Funguje bez účtu a i po zavření aplikace, ale změny se automaticky nesynchronizují mezi dvěma telefony. Pro sdílené živé úpravy více lidí je potřeba připojit databázi (například Supabase) a přihlášení.

## Aktualizace kontaktů

Po změně zdrojových CSV spusťte ve složce aplikace:

```sh
python3 build_contacts.py
```

Pozor: volba **Obnovit původní data** v aplikaci zahodí místní změny a znovu načte `contacts.json`.
