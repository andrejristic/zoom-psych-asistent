# App 2 — Riječi + glas + lice

Sve što radi [App 1](APP1-rijeci.md), plus analiza **glasa (prozodija)** i **lica**, uz fuziju kanala.
Zajednička osnova, jezik i pravni dio su u [PLAN.md](PLAN.md).

## Šta App 2 dodaje
- **Nesklad između kanala, a to je najvrjedniji signal:** riječi kažu "odlično", a glas je ravan i lice napeto.
- **Emocionalno stanje** (stres, uzbuđenje, dosada) i kad je sugovornik tih.
- **Reakcija na tvoju izjavu** u prvih 1–2 s, prije nego što odgovori.

## Pipeline

```
audio ──┬─► [App 1 pipeline: STT + jezik]
        └─► ProsodyProvider (Hume / ...) ──► ton, tempo, energija, emocije iz glasa
video ─────► FaceProvider (Hume / AWS Rekognition / LLM vision)
              ──► izrazi, osmijeh (Duchenne?), pogled, treptanje, dodir lica
                     │
                     ▼
          FUSION ENGINE
          - vremensko poravnanje svih kanala (prozori od 2–3 s)
          - baseline po kanalu, po osobi
          - z-score odstupanja
          - pravilo: savjet tek kad se poklope ≥2 kanala
          - težine po kanalu: jezik > glas > lice
            (na srpskom niža težina za glas i lice dok se ne izmjeri)
                     │
                     ▼
          Advisor (isti kao App 1, dobija i signale glasa i lica)
```

## Signali (dodatni)

| Signal | Kanali | Primjer savjeta |
|---|---|---|
| Pozitivne riječi + ravan / napet glas | jezik + glas | "'Super' ne zvuči kao 'da', pitaj šta ga brine" |
| Visina tona raste kod jedne teme | glas | "Tema X je osjetljiva, idi polako" |
| Osmijeh bez očiju | lice | "Ljubaznost, ne slaganje" |
| Mikroreakcija na tvoju cijenu / ponudu | lice + glas | "Reagovao je na cijenu, otvori prostor za pitanja" |
| Pogled van ekrana + duga pauza | lice + timestampovi | "Možda se konsultuje ili čita, pitaj direktno" |
| Opuštanje (glas, lice) nakon tvog ustupka | glas + lice | "Ustupak je bio važan, ne nudi više" |
| Energija opada | glas + lice | "Skrati, predloži sljedeći korak" |

## Specifični problemi App 2
- **Zoom kompresija i loše kamere** kvare mikroizraze, pa lice nikad ne odlučuje samo.
- **Galerijski prikaz:** treba prepoznati koji prozor je govornik (aktivni govornik ili ručni izbor).
- **Ugašena kamera:** App 2 se automatski vraća na App 1 + glas.
- **Jezik i kultura:** prozodijski modeli su trenirani pretežno na engleskom, pa za srpski treba baseline i kalibracija.
- **Latencija:** analiza slika je sporija, pa se lice analizira 1–2 fps i samo oko izjava.
- **Pravno:** biometrija znači izričit pristanak (vidi PLAN.md §4) i obavezan prekidač "samo transkript".

## Provajderi (samo online)

| Dio | Opcije |
|---|---|
| Prozodija | Hume AI Expression Measurement (streaming) |
| Lice | Hume AI, AWS Rekognition, multimodalni LLM nad frameovima (Gemini, GPT, Claude) |
| "Sve u jednom" realtime (opcija) | Gemini Live API, OpenAI Realtime API |

## Plan izrade (+4–6 sedmica na App 1)
- [ ] Capture: Zoom prozor 1–2 fps, izrez lica aktivnog govornika
- [ ] ProsodyProvider: Hume adapter (streaming)
- [ ] FaceProvider: Hume + AWS Rekognition + LLM vision adapteri
- [ ] Vremensko poravnanje kanala
- [ ] Fusion engine: baseline po kanalu, z-score, težine, pravilo ≥2 kanala
- [ ] Kalibracija težina po jeziku (en vs sr) na snimljenim pozivima
- [ ] UI: indikatori (stres, angažovanost, otpor, nesklad) + vremenska linija
- [ ] Rezerva: kamera ugašena → bez lica; Hume ne radi → samo App 1
- [ ] Pristanak u UI, "samo transkript", rok čuvanja

## Ciljevi kvaliteta
- **Latencija:** ≤ 5 s
- **Lice:** nikad ne daje savjet samo, uvijek u kombinaciji s jezikom ili glasom
- **Mjerenje:** da li App 2 daje bolje savjete od App 1 na istim pozivima (A/B na snimcima).
  Ako ne daje, kanal se gasi.

## Trošak (procjena)
- **App 1:** ~$0.3–1.5 / sat
- **Hume glas + lice:** ~$1–4 / sat
- **Ukupno:** **~$1–6 / sat**
