# Plan izgradnje

Proizvod ZeravaTech · zeravatech.ca · engleski + srpski · kontekst se čita iz govora.
Opšti dio je u [PLAN.md](PLAN.md), a detalji aplikacija u [APP1-rijeci.md](APP1-rijeci.md) i [APP2-multimodal.md](APP2-multimodal.md).

## Pregled

| Faza | Šta | Trajanje | Rezultat |
|---|---|---|---|
| 0 | Postavka + test snimci | 3 dana | repo, ključevi, označeni snimci en/sr |
| 1 | Test provajdera po jeziku | 3 dana | routing en / sr / miješano |
| 2 | Program za hvatanje zvuka | 4 dana | zvuk iz Zooma stiže na server |
| 3 | Server: osnova | 1 sedmica | adapteri, fallback, baza, WebSocket |
| 4 | App 1: kontekst, signali, savjeti | 2 sedmice | savjeti uživo |
| 5 | UI + izvještaj | 1 sedmica | **App 1 MVP (interno)** |
| 6 | Mjerenje kvaliteta | 3 dana | precision/recall po jeziku |
| 7 | Proizvod: auth, plaćanje, privatnost, deploy | 2 sedmice | |
| 8 | Desktop app (Tauri) + potpisivanje | 1.5 sedmica | |
| 9 | Landing + pravno + zatvorena beta | 1–2 sedmice | **App 1 beta na zeravatech.ca** |
| 10 | App 2: glas | 1 sedmica | |
| 11 | App 2: lice | 1.5 sedmica | |
| 12 | App 2: spajanje kanala + kalibracija | 1 sedmica | **App 2 ("Pro") beta** |
| 13 | Javno lansiranje | — | |

**~10–11 sedmica do App 1 bete, ~14–15 do App 2.**
App 1 ide korisnicima prije App 2: brže donosi prihod i povratne informacije, a pravno je jednostavnija.

---

## Faza 0 — Postavka (dan 1–3)

- [ ] **Repo:** struktura iz PLAN.md §3, `uv`, `ruff`, `pytest`, `pre-commit`, GitHub Actions, Postgres preko `docker-compose`
- [ ] **Firma:**
  - nalozi na provajderima otvoreni na ZeravaTech (ne lično), firmina kartica
  - limit potrošnje na svakom nalogu
- [ ] **Ključevi:**
  - STT: Deepgram, AssemblyAI, OpenAI, Azure (Canada Central), Google, Speechmatics
  - LLM: Anthropic, OpenAI, Google
  - App 2 (kasnije): Hume, AWS
- [ ] **Config:** pydantic shema za `config.yaml`; upozorenje ako je za srpski izabran slab LLM
- [ ] **Test snimci** (uz pristanak, odvojeni kanali za tebe i sugovornika). **Raznoliki razgovori, ne po scenariju:**
  - 4× engleski: različiti akcenti, formalno i neformalno, poslovno i privatno
  - 3× srpski
  - 2× miješano srpski + engleski
  - 2× igra uloga sa poznatim tačkama: sugovornik na nekim mjestima namjerno izbjegava odgovor, pretjeruje, protivreči sebi
- [ ] **Označavanje snimaka:** ručno ispravljen transkript + momenti `{t, tip, opis}` + kontekst po minutama (tip razgovora, faza) u `benchmark/data/`

---

## Faza 1 — Test provajdera (dan 4–6)

- [ ] **`benchmark/stt_bench.py`:** streaming simulacija u realnom vremenu. Za **en / sr / miješano** mjeri:
  - WER (`jiwer`)
  - latenciju
  - tačnost vremena riječi
  - **konzistentnost pisma za srpski** (ćirilica/latinica)
  - cijenu
- [ ] **`benchmark/llm_bench.py`:** na označenim transkriptima mjeri:
  - označavanje signala (recall/precision)
  - **prepoznavanje konteksta** (tip razgovora, faza, uloge naspram tvojih oznaka)
  - latenciju p50/p95
  - cijenu
  - kvalitet srpskog izlaza (ocjena 1–5)
- [ ] **Odluka:** `routing` za `en`, `sr`, `mixed` + brzi i jaki model

---

## Faza 2 — Program za hvatanje zvuka (4 dana)

- [ ] **Dva toka:** mikrofon (korisnik = A) i sistemski loopback (sugovornik = B). Govornik je tako poznat bez razdvajanja govornika. Uz to ide preporuka za slušalice.
- [ ] **Grupni poziv:** u loopback toku je više ljudi, pa se koristi diarizacija STT-a samo na tom toku
- [ ] **Linux:** PipeWire/Pulse `.monitor` izvor + mikrofon, PCM 16 kHz mono, komadi od 20–40 ms
- [ ] **WebSocket protokol:**
  - binarno: `{stream: self|remote, seq, ts_ms}` + PCM
  - JSON: `session.start {call_lang, advice_lang, goal?, privacy}`, `session.end`, `ping`
- [ ] **Pouzdanost:** ponovno spajanje, bafer od 5 s, usklađivanje satova
- [ ] **Autentifikacija:** kratkotrajan token sesije (priprema za fazu 7)
- [ ] **Gotovo je kad:** pravi Zoom poziv daje dva sinhronizovana `.wav` fajla na serveru

---

## Faza 3 — Server: osnova (1 sedmica)

- [ ] **FastAPI:**
  - `/ws/capture`, `/ws/ui`
  - `/api/sessions`, `/api/sessions/{id}/report`, `/api/feedback`
- [ ] **Adapteri:**
  - `STTProvider`: oni izabrani u fazi 1
  - `LLMProvider` preko LiteLLM
  - registry čita routing iz configa
- [ ] **Fallback:** < 2 s; za STT ponovno spajanje + bafer zadnjih 2 s zvuka
- [ ] **Structured output:** pydantic provjera, 1 ponovljeni pokušaj
- [ ] **Jezik:**
  - detekcija u prvih ~10 s (višejezični STT), pa prelaz na provajdera iz routinga
  - miješani jezik: ostaje višejezični STT
  - `core/language/sr_script.py`: ćirilica ↔ latinica + testovi (lj, nj, dž, velika slova)
- [ ] **Baza:**
  ```
  users, orgs, subscriptions                 (priprema za fazu 7)
  sessions   (id, user_id, started_at, call_lang, advice_lang, goal, providers_json, cost_usd)
  utterances (id, session_id, speaker, text, lang, t_start, t_end, words_json)
  contexts   (id, session_id, t, type, phase, roles_json, user_aim, tone)
  signals    (id, session_id, utterance_id, channel, type, value, zscore, evidence, t)
  advice     (id, session_id, t, text, observed_json, confidence, category, model, prompt_ver, latency_ms)
  feedback   (advice_id, rating, comment)
  baselines  (session_id, speaker, channel, metric, median, mad, n)
  ```
- [ ] **Praćenje rada:** Langfuse, Sentry, trošak po sesiji (LiteLLM + STT)

---

## Faza 4 — App 1: kontekst, signali, savjeti (2 sedmice)

**4.1 Potezi i parovi pitanje → odgovor**
- [ ] Spajanje izjava u poteze (pauza < 700 ms)
- [ ] Prepoznavanje pitanja osobe A (en: wh-riječi, inverzija, "?"; sr: "da li", "je l'", upitne riječi, "?"). Par pitanje-odgovor je osnovna jedinica.

**4.2 Signali iz vremena riječi** (bez LLM-a)
- [ ] latencija odgovora, tempo, dužina odgovora, poštapalice (en: um, uh; sr: ovaj, ono, pa, e), prekidanja, udio govora

**4.3 Baseline**
- [ ] Prvih 3–5 min ili 15 odgovora: median + MAD, `z = (x − med)/(1.4826·MAD)`, signal je |z| > 2
- [ ] Polako ažuriranje, bez momenata koji su već signali
- [ ] Prije baselinea: samo signali iz sadržaja

**4.4 Čitanje konteksta iz govora** (`core/context/`), **novo i ključno**
- [ ] Jaki LLM svakih ~60 s (i na početku čim ima ~90 s razgovora) vraća:
  ```json
  {"type":"sales|negotiation|interview|collaboration|conflict|support|personal|other",
   "phase":"opening|discovery|proposal|objections|agreement|closing",
   "roles":{"A":"seller","B":"buyer, not final decision maker"},
   "user_aim":"close a pilot deal",
   "counterpart_aim":"lower price, low risk",
   "tone":"formal|friendly|tense",
   "confidence":0.7}
  ```
- [ ] Kontekst ima **inerciju**: mijenja se tek kad 2 uzastopne procjene kažu isto (bez skakanja)
- [ ] Ako je korisnik upisao cilj, on ide kao "hint", ne kao zamjena
- [ ] Kontekst ide u svaki prompt brzog i jakog modela
- [ ] UI prikazuje kontekst sitno ("Prodaja · faza: prigovori"), a korisnik ga može ispraviti jednim klikom. Ispravka se pamti za tu sesiju.

**4.5 Leksikoni** `en.yaml`, `sr.yaml`
- [ ] Kategorije: `hedges`, `assurances`, `distancing`, `deflection`, `commitment`, `negative_softeners`
- [ ] Regex predfilter: ako u izjavi nema ničega i timing je normalan, brzi LLM se ne zove

**4.6 Brzi LLM: označavanje**
- [ ] Pokreće se na svaku završenu izjavu osobe B (uz predfilter); ulaz je izjava + A-ovo pitanje + pogoci iz leksikona + kontekst + jezik
- [ ] Izlaz `{tags:[{type, span, strength}]}`, cilj < 1.5 s

**4.7 Jaki LLM: duboka analiza**
- [ ] Pokreće se svakih 15 s, ili odmah kad je par pitanje-odgovor sa ≥1 signalom
- [ ] Ulaz:
  - kontekst
  - rolling sažetak
  - zadnje 2 min
  - memorija tvrdnji
  - signali sa z-score vrijednostima
- [ ] Izlaz: 0 ili 1 savjet (format iz PLAN.md §3)

**4.8 Memorija tvrdnji**
- [ ] Brojevi, datumi, obećanja i činjenice osobe B idu u listu, a svaka nova tvrdnja se poredi sa njom. To je izvor savjeta o kontradikcijama.

**4.9 Prompt**
- [ ] Jedan **univerzalni** sistemski prompt na engleskom (bez varijanti po scenariju) + dinamički kontekst blok
- [ ] Pravila:
  - analyze in original language, never translate quotes
  - write advice in {advice_lang}
  - never claim lying; describe mismatch and suggest a question
  - weak evidence → no advice
- [ ] Verzionisanje promptova (`prompt_ver` uz svaki savjet)

**4.10 Filter savjeta**
- [ ] `confidence < 0.5` → savjet se odbacuje
- [ ] najviše 1 savjet / 30 s (osim `priority: high`)
- [ ] ista kategorija ne može dvaput u 2 min
- [ ] savjet se ne prikazuje dok korisnik govori
- [ ] na izlazu: konverzija u ćirilicu ako je izabrana

---

## Faza 5 — UI + izvještaj (1 sedmica)

- [ ] **Početni ekran:**
  - jezik savjeta (en / sr-Latn / sr-Cyrl)
  - jezik poziva (auto)
  - opciono jedna rečenica cilja
  - "samo transkript"
- [ ] **Ekran poziva uživo:**
  - kartica savjeta + "šta sam primijetio"
  - 👍/👎 na svakom savjetu
  - transkript uživo sa označenim signalima
  - linija konteksta (može se ispraviti)
  - mali indikatori
- [ ] **Izvještaj nakon poziva:**
  - ključni momenti
  - obećanja osobe B
  - otvorena pitanja
  - preporuke za sljedeći razgovor
  - vremenska linija
  - izvoz u PDF/MD
- [ ] UI na engleskom i srpskom (i18n od prvog dana, jer je francuski vjerovatan kasnije)
- [ ] **App 1 MVP je gotov (interno).**

---

## Faza 6 — Mjerenje kvaliteta (3 dana)

- [ ] `benchmark/replay.py`: snimci kroz cijeli sistem
- [ ] **Metrike po jeziku (en, sr, miješano):**
  - recall/precision signala
  - tačnost konteksta
  - latencija p50/p95
  - trošak po satu
- [ ] Regresioni test: promjena prompta ide u upotrebu tek ako prođe replay
- [ ] Sedmični pregled 👍/👎 po kategoriji

---

## Faza 7 — Proizvod: auth, plaćanje, privatnost, deploy (2 sedmice)

- [ ] **Auth:**
  - Clerk ili Supabase Auth (email + Google + Microsoft prijava)
  - organizacije/timovi za "Team" paket
- [ ] **Stripe:**
  - pretplate u CAD
  - Stripe Tax (GST/HST)
  - mjerenje potrošnje (minute poziva)
  - customer portal
  - webhookovi
- [ ] **Limiti:**
  - minute po paketu
  - zaštita od zloupotrebe (rate limit, najduža dužina sesije)
  - App 2 funkcije samo za "Pro"
- [ ] **Privatnost:**
  - "samo transkript"
  - zvuk se ne čuva po defaultu
  - rok čuvanja + automatsko brisanje
  - "obriši sesiju" / "obriši nalog"
  - izvoz podataka korisnika
  - zapis pristupa (audit log)
- [ ] **AI provajderi:** DPA sa svakim + podešavanje da ne čuvaju podatke i ne treniraju na njima (gdje je dostupno)
- [ ] **Deploy:**
  - Docker
  - Fly.io `yyz` ili AWS ca-central-1
  - Postgres u CA regionu
  - `api.zeravatech.ca`, `app.zeravatech.ca` (DNS, TLS)
  - staging i produkcija odvojeno
  - automatski deploy iz `main` nakon testova
- [ ] **Praćenje:** uptime, alarmi na latenciju i greške provajdera, dnevni trošak AI-ja naspram prihoda

---

## Faza 8 — Desktop aplikacija (1.5 sedmica)

- [ ] **Tauri app:**
  - prijava
  - hvatanje zvuka (Win WASAPI loopback, Mac ScreenCaptureKit, Linux PipeWire)
  - mali overlay prozor sa savjetom iznad Zooma
- [ ] **Dozvole:**
  - Mac: mikrofon + snimanje ekrana
  - Windows: mikrofon
- [ ] **Potpisivanje koda:**
  - Windows code signing cert
  - Apple Developer ID (na ZeravaTech) + notarizacija
- [ ] **Automatsko ažuriranje** (Tauri updater)
- [ ] **Instalacijski paketi** za preuzimanje sa `zeravatech.ca`

---

## Faza 9 — Landing, pravno, beta (1–2 sedmice)

- [ ] **Ime proizvoda** + provjera zaštićenog imena (CIPO) i domena
- [ ] **Landing `zeravatech.ca/<proizvod>`:**
  - šta radi
  - demo video
  - cijene
  - FAQ
  - poštena pozicija ("conversation coach", ne "lie detector")
- [ ] **Pravni dokumenti:**
  - Privacy Policy, Terms of Service, Acceptable Use, DPA za poslovne kupce
  - imenovan privacy officer
  - plan za curenje podataka (breach plan)
  - pregled kod advokata
- [ ] **Odluka o Quebecu:** ne prodavati u prvoj verziji, ili francuski UI + dokumenti
- [ ] **Zatvorena beta:**
  - 10–20 korisnika
  - besplatno uz obavezne povratne informacije
  - mjerenje 👍/👎, zadržavanja korisnika, troška po korisniku
- [ ] **App 1 beta je na zeravatech.ca.**

---

## Faza 10 — App 2: glas (1 sedmica)

- [ ] Hume streaming adapter, samo tok osobe B
- [ ] Mjere glasa idu u baseline i vežu se za izjave
- [ ] Novi signal je **nesklad**: sadržaj je pozitivan, a glas ravan ili napet
- [ ] Za srpski: niža težina glasa dok se kalibracijom ne potvrdi
- [ ] Rezerva: Hume ne radi → App 1

## Faza 11 — App 2: lice (1.5 sedmica)

- [ ] **Hvatanje Zoom prozora** 1–2 fps:
  - Mac: ScreenCaptureKit
  - Windows: Graphics Capture
  - Linux Wayland: xdg-desktop-portal
- [ ] **Izrez lica:** speaker view preporučen, u galeriji ručni izbor
- [ ] **Adapteri:** Hume, AWS Rekognition, LLM vision; analiza samo ±2 s oko parova pitanje-odgovor
- [ ] **Kamera ugašena:** kanal se isključuje bez greške

## Faza 12 — App 2: spajanje kanala + kalibracija (1 sedmica)

- [ ] **Vremensko poravnanje:** prozori od 2–3 s
- [ ] **Skor:** `Σ težina·|z|`, savjet tek kad su **≥2 kanala** iznad praga
- [ ] **Težine po jeziku:**
  - en: jezik 1.0, glas 0.6, lice 0.4
  - sr: jezik 1.0, glas 0.4, lice 0.3
  - kalibrisati na snimcima
- [ ] **A/B na istim snimcima:** App 1 naspram App 2. Kanal koji ne pomaže se gasi.
- [ ] **Pristanak:** ekran za potvrdu pristanka za biometriju prije svakog poziva sa uključenim App 2 funkcijama
- [ ] **"Pro" paket beta.**

## Faza 13 — Lansiranje

- [ ] Javno otvaranje registracije
- [ ] Recall.ai bot mod (korisnik zalijepi Zoom link, bot uđe u poziv)
- [ ] Zoom Marketplace (ako se koristi Zoom SDK)
- [ ] Bosanski i hrvatski (leksikoni + test), francuski za Quebec
- [ ] Integracije: izvoz izvještaja u CRM (HubSpot, Salesforce), Google Meet i Teams

---

## Otvorene odluke (nisu hitne)
- [ ] Ime proizvoda
- [ ] Cijene paketa
- [ ] Quebec u prvoj verziji: da ili ne
