# Aera

Beta eines AI-nativen ERP für E-Commerce: Aufträge, Einkauf, Lager und Belege auf einer gemeinsamen Plattform.

Bestand entsteht nur über Bewegungen. Module teilen sich Organisation, Rechte, Audit, Dokumente, Suche und Ereignisse.

## Start

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Anmeldung: `mia.berg@heller.demo` / `aera-beta`

Weitere Rollen stehen auf dem Anmeldebildschirm. Die Demo-Firma ist Heller Goods.

`Cmd/Ctrl+K` öffnet die Suche, `Cmd/Ctrl+J` den Assistenten. Der Assistent liest die operativen Daten direkt. Ein Sprachmodell kann `interpret()` später ersetzen, die Abfragen bleiben.

## Umfang der Beta

Enthalten, bewusst schmal: Dashboard, Produkte, Lieferanten, Einkauf, Kunden, Aufträge, Bestände, Lager, Sendungen, Retouren, Rechnungen, Buchhaltung, Dokumente, Aktivitäten, Berichte, Einstellungen.

Nicht enthalten: Marktplatz-Anbindungen, DATEV-Export, Teilrechnungen, Reservierungen, Mandanten über eine Organisation hinaus. Die Objekte sind so geschnitten, dass das später ohne neues Kernmodell dazukommt.
