# App 1 — Riječi

Sluša Zoom, pretvara govor u tekst i daje savjete **samo na osnovu riječi i toka razgovora**.
Zajednička osnova, jezik i pravni dio su u [PLAN.md](PLAN.md).

## Zašto je App 1 vrijedna sama za sebe
- Jezik je **najpouzdaniji kanal**, a LLM je u tome najjači.
- Jeftina je (~$0.3–1.5 / sat), brza, lakša pravno (nema biometrije) i radi i sa ugašenom kamerom.
- Pauze i tempo se dobiju **besplatno** iz STT timestampova, bez analize zvuka.

## Pipeline

```
loopback audio ──► STT (streaming, diarizacija, timestampovi, detekcija jezika)
                    │
                    ├─► Signali iz timestampova: latencija odgovora, tempo (riječi/min),
                    │   dužina odgovora, prekidanja, ko koliko priča
                    │
                    ├─► Brza analiza (svaka izjava, mali brzi model):
                    │   ograde, uvjeravanja, izbjegavanje, distanciranje (+ leksikon jezika)
                    │
                    └─► Duboka analiza (svakih ~15 s, jak model, cijeli transkript):
                        kontradikcije, promjena stava, šta nije rečeno, ko ima moć odluke,
                        otpor, interes, šta sugovornik stvarno želi
                                │
                                ▼
                        Advisor → savjet (JSON) → UI
```

**Dva nivoa LLM-a:**
- **Brzi (Haiku / GPT mini / Gemini Flash):** svaka izjava, < 1.5 s, samo označava signale
- **Jaki (Sonnet / GPT / Gemini Pro):** povremeno, daje savjete i radi analizu konteksta

## Signali (samo iz riječi)

| Signal | Izvor | Primjer savjeta |
|---|---|---|
| Latencija odgovora > baseline | timestampovi | "Pitanje ga je zateklo, daj mu vrijeme ili ga preformuliši" |
| Ograde / neodređenost | brzi LLM + leksikon | "Traži konkretan broj ili rok" |
| Pretjerano uvjeravanje ("iskreno", "vjeruj mi") | brzi LLM + leksikon | "Traži dokaz ili primjer" |
| Odgovor na drugo pitanje | jaki LLM | "Vrati se na pitanje o cijeni" |
| Kontradikcija s ranijom izjavom | jaki LLM (cijeli transkript) | "Pojasni: ranije je rekao X" |
| Distanciranje (pasiv, "mi", "ljudi") | brzi LLM | "Pitaj ko je konkretno odlučio" |
| Kraći odgovori, manje pitanja | timestampovi + LLM | "Gubi interes, pitaj šta mu je važno" |
| Ponavljanje tvojih riječi, pitanja o detaljima | jaki LLM | "Interes raste, dobar trenutak za prijedlog" |
| Prigovor skriven u pitanju | jaki LLM | "Iza pitanja o roku je strah od rizika, ponudi garanciju" |

## Kontekst se čita iz govora (bez biranja scenarija)
Korisnik ne bira "pregovori / prodaja / intervju". Jaki LLM svakih ~60 s iz samog razgovora procjenjuje:
- **tip razgovora:** prodaja, pregovori, intervju, saradnja, konflikt, privatno...
- **uloge:** ko pita, ko odlučuje, ko šta želi
- **fazu:** upoznavanje, istraživanje, ponuda, prigovori, dogovor, zatvaranje
- **ton odnosa:** formalan, prijateljski, napet
- **šta korisnik (A) izgleda da želi postići**

Taj "kontekst blok" ide u svaki prompt, pa se savjeti prilagođavaju toku razgovora.
Korisnik može (opciono) upisati jednu rečenicu cilja, koja se tada samo dodaje kontekstu.

## Plan izrade (1–2 sedmice)
- [ ] Capture: loopback audio → WebSocket (Linux PipeWire prvo, pa Windows/Mac)
- [ ] STT adapteri: 2 za engleski + 1–2 za srpski (prema jezičkom benchmarku)
- [ ] Detekcija jezika + routing
- [ ] Signali iz timestampova + baseline (prvih 3–5 min)
- [ ] Leksikoni `en`, `sr` (`bs`, `hr` kasnije, jer su bliski srpskom)
- [ ] Brzi i jaki LLM preko LiteLLM, sa fallbackom
- [ ] Promptovi na engleskom (instrukcije), analiza na jeziku poziva, savjet na jeziku korisnika
- [ ] Web UI: transkript, kartice savjeta, izbor jezika savjeta, opciono jedna rečenica cilja
- [ ] Izvještaj nakon poziva
- [ ] Testovi na snimljenim pozivima: precision savjeta (ocjena 👍/👎)

## Ciljevi kvaliteta
- **Latencija:** od kraja rečenice do savjeta ≤ 4 s
- **Učestalost:** najviše 1 savjet / 30 s
- **Jezici:** engleski primarno; srpski blizu engleskog kvaliteta (mjeriti posebno)

## Trošak (procjena)
- **STT:** ~$0.25–0.50 / sat
- **LLM (brzi + jaki):** ~$0.10–1.00 / sat
- **Ukupno:** **~$0.3–1.5 / sat**
