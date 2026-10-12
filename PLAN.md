# Zoom Psych Asistent — zajednički plan

**Proizvod firme ZeravaTech** · objava na **zeravatech.ca** · jezici: **engleski** (primarni), **srpski** (drugi)

Dvije aplikacije sa zajedničkom osnovom:

| | **App 1 — Riječi** | **App 2 — Riječi + sve ostalo** |
|---|---|---|
| Ulaz | samo audio → transkript | audio + video |
| Analiza | jezik, struktura razgovora, pauze iz timestampova | + prozodija glasa, + lice, + fuzija kanala |
| Detalji | [APP1-rijeci.md](APP1-rijeci.md) | [APP2-multimodal.md](APP2-multimodal.md) |
| Pravno | lakše (samo transkript) | teže (biometrija) |
| Trošak / sat | ~$0.3–1.5 | ~$1–6 |

Na tržište mogu izaći kao **dva paketa** (npr. "Words" i "Pro") istog proizvoda.
Detaljan plan izrade je u [BUILD.md](BUILD.md).

**Osnovna pravila:**
- **Bez presuda tipa "laže".** Aplikacija samo kaže: "nešto se ne slaže, evo šta sam primijetio i šta da pitaš".
- **Bez biranja scenarija.** Kontekst razgovora (tip, uloge, faza) aplikacija sama čita iz govora.

---

## 1. Zašto samo online
Offline LLM-ovi na običnom računaru su spori (3–10 s po savjetu) i slabi na srpskom.
Cloud modeli (Claude, GPT, Gemini) su brži i bolji. Izuzetak bi kasnije mogao biti "privatni mod" za regulisane klijente.

---

## 2. Jezik

### 2.1 Obim
- **Engleski:** primarni jezik, prvi koji se testira i polira. Uključuje kanadski, američki, britanski i indijski engleski, kao i engleski sa stranim akcentom.
- **Srpski:** drugi jezik. Ćirilica i latinica, ekavica (ijekavica se razumije).
- **Miješanje srpskog i engleskog** u istoj rečenici je podržano (dijaspora).
- **Kasnije:**
  - bosanski i hrvatski: blizu srpskom, pa je dodavanje jeftino
  - francuski: obavezan ako se prodaje u Quebecu, vidi §5

### 2.2 Pravila
1. **Analiza na originalnom jeziku, nikad preko prevoda.** "Valjda", "ma nema problema", "iskreno da ti kažem" ili "to be honest", "I guess" su upravo signali, a prevod ih briše.
2. **Jezik savjeta bira korisnik:** `en`, `sr-Latn`, `sr-Cyrl`. Ne zavisi od jezika poziva.
3. **Pismo za srpski:** transkript se interno uvijek normalizuje na **latinicu**, jer STT nekad vraća ćirilicu, a nekad latinicu.
   Konverzija je deterministička (ćirilica ↔ latinica, sa pazom na lj/nj/dž). Ako korisnik izabere ćirilicu, savjet se konvertuje tek na izlazu.
4. **Kulturni kontekst:** prompt dobija jezik i kulturu sugovornika, jer direktnost, glasnoća i formalnost znače različito u kanadskom poslovnom engleskom i u srpskom.

### 2.3 Podrška po komponenti (potvrditi testom u fazi 1)

**STT**

| Provajder | Engleski | Srpski | Napomena |
|---|---|---|---|
| Deepgram | odlično, najbrži | provjeriti | kandidat za engleski |
| AssemblyAI | odlično | provjeriti | kandidat za engleski |
| OpenAI (Whisper / gpt-4o-transcribe) | odlično | dobro | dobar za miješanje jezika; pismo nekonzistentno |
| Azure Speech | odlično | sr-RS | Canada Central region |
| Google Speech | odlično | sr-RS | CA region |
| Speechmatics | odlično | provjeriti | dobar za akcente |

**LLM**

| Provajder | Engleski | Srpski |
|---|---|---|
| Anthropic Claude | odlično | odlično |
| OpenAI GPT | odlično | odlično |
| Google Gemini | odlično | vrlo dobro |
| Mistral, Groq (Llama) | dobro | slabije, samo za engleski |

### 2.4 Config

```yaml
language:
  call: auto              # auto | en | sr
  allow_mixing: true
  advice: en              # en | sr-Latn | sr-Cyrl
routing:
  en: { stt: deepgram, llm_fast: anthropic/haiku, llm_deep: anthropic/sonnet }
  sr: { stt: azure,    llm_fast: anthropic/haiku, llm_deep: anthropic/sonnet }
  mixed: { stt: openai, llm_fast: anthropic/haiku, llm_deep: anthropic/sonnet }
```
(Konačni izbor provajdera zavisi od testa u fazi 1.)

### 2.5 Leksikoni
Leksikoni su u `core/language/lexicons/en.yaml` i `sr.yaml`. LLM ih koristi kao smjernicu, ne kao jedino pravilo.

```yaml
# en.yaml (izvod)
hedges:     [i guess, sort of, kind of, probably, roughly, as far as i know, i think]
assurances: [to be honest, honestly, trust me, believe me, i swear, frankly]
distancing: [mistakes were made, people say, we decided, it was handled]
deflection: [that's a good question, let me get back to you, it's complicated]

# sr.yaml (izvod)
hedges:     [valjda, otprilike, možda, kao, nekako, ne znam tačno, koliko ja znam]
assurances: [iskreno, veruj mi, kunem se, stvarno, ma da, ma nema problema]
distancing: [to se desilo, ljudi kažu, mi smo odlučili]
deflection: [nego da te pitam, to je duga priča, nije bitno sad]
```

---

## 3. Zajednička osnova (`core/`)

```
zoom-psych-asistent/
├── core/
│   ├── capture/     # loopback audio (+ video za App 2), Recall.ai bot mod
│   ├── providers/   # adapteri: stt/, llm/ (+ prosody/, face/)
│   ├── language/    # detekcija jezika, routing, leksikoni, sr ćirilica↔latinica
│   ├── context/     # čitanje konteksta iz govora (tip, uloge, faza)
│   ├── advisor/     # promptovi, JSON shema savjeta, filter
│   ├── session/     # baza, baseline
│   ├── billing/     # Stripe, potrošnja po korisniku
│   └── config/
├── app1_words/
├── app2_multimodal/
├── frontend/        # app.zeravatech.ca
├── desktop/         # Tauri: hvatanje zvuka + overlay prozor
└── benchmark/
```

### Stack
- **Server:** Python 3.12, FastAPI, Pipecat, LiteLLM
- **Frontend:** Next.js, na `app.zeravatech.ca`
- **Desktop:** Tauri (Windows, Mac, Linux)
- **Baza i auth:** Postgres + Auth (Supabase ili Neon + Clerk)
- **Hosting:** Fly.io Toronto ili AWS ca-central-1
- **Plaćanje:** Stripe (CAD, porezi GST/HST preko Stripe Tax)
- **Praćenje:** Langfuse (LLM), Sentry (greške)

### Format savjeta

```json
{
  "advice": "Ask for a specific delivery date",
  "observed": ["said 'roughly in a few weeks'", "2.1 s pause before answering"],
  "channels": ["language", "timing"],
  "confidence": 0.6,
  "category": "vagueness",
  "advice_lang": "en"
}
```

---

## 4. Pravni okvir — Kanada (ZeravaTech kao pružalac usluge)

- **Snimanje:** Criminal Code s.184 traži pristanak jedne strane. Korisnik je učesnik u pozivu.
- **PIPEDA:** ZeravaTech obrađuje lične podatke i korisnika i njegovih sugovornika. To traži:
  - imenovanu osobu odgovornu za privatnost (privacy officer)
  - Privacy Policy i Terms of Service na zeravatech.ca
  - evidenciju i prijavu curenja podataka (breach reporting OPC-u)
  - ugovore o obradi podataka (DPA) sa svim AI provajderima, uz opciju da provajder ne čuva podatke i ne trenira na njima
- **App 2:** glas i lice su biometrija, pa treba izričit pristanak. Korisnik je odgovoran da ga dobije od sugovornika; ToS to navodi, a aplikacija nudi gotov tekst.
- **Quebec:**
  - Law 25: procjena uticaja na privatnost, prijava biometrije CAI-ju
  - **Bill 96:** proizvod i ugovori moraju biti dostupni na **francuskom** ako se prodaje u Quebecu.
    Opcija je ne prodavati u Quebecu u prvoj verziji.
- **Marketing (Competition Act):** ne tvrditi "detekcija laži" ni tačnost koja nije izmjerena. Pozicionirati kao
  "AI conversation coach / meeting insights".
- **EU kupci (kasnije):** AI Act zabranjuje prepoznavanje emocija na radnom mjestu, pa App 2 ne smije biti dostupna za EU radna okruženja.

*(Nije pravni savjet. Prije lansiranja advokat za privatnost / tech u Kanadi.)*

---

## 5. Proizvod na zeravatech.ca

- **`zeravatech.ca/<ime-proizvoda>`:** landing stranica, cijene, FAQ, Privacy, Terms
- **`app.zeravatech.ca`:** web aplikacija (dashboard, sesije, izvještaji, podešavanja, plaćanje)
- **`api.zeravatech.ca`:** server (WebSocket + REST)
- **Desktop aplikacija:** preuzimanje sa sajta. Windows i Mac zahtijevaju **potpisan kod** (Windows code signing cert, Apple Developer ID + notarizacija).
- **Paketi (primjer, odrediti kasnije):**
  - Free trial: X minuta
  - **Words:** App 1, mjesečna pretplata + uključene minute
  - **Pro:** App 2 + izvještaji
  - Team: više korisnika, admin
- **Ime proizvoda:** treba odlučiti (+ provjera zaštićenog imena i domena)
- **Zoom Marketplace (kasnije):** ako se koristi Zoom SDK ili bot, Zoom aplikacija mora proći njihov review

---

## 6. Redoslijed
Pogledaj [BUILD.md](BUILD.md).
