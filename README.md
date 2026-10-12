# Zoom Psych Asistent

AI conversation coach za Zoom pozive. Prati sugovornika u realnom vremenu i daje diskretne savjete.
Proizvod ZeravaTech (zeravatech.ca), trenutno u fazi planiranja.

- [PLAN.md](PLAN.md): zajednički plan (jezik, arhitektura, pravno, proizvod)
- [BUILD.md](BUILD.md): detaljan plan izgradnje po fazama
- [APP1-rijeci.md](APP1-rijeci.md): App 1, savjeti samo iz riječi
- [APP2-multimodal.md](APP2-multimodal.md): App 2, riječi + glas + lice

## Aplikacija (App 1, verzija 0.1.0)

Kod je u [app/](app/): Electron + React + TypeScript. Licenca je GPL-3.0-or-later, vidi [LICENSE](LICENSE) i [NOTICE](NOTICE).

**Šta radi sada:**
- Uzak prozor pored Zooma: savet sa obrazloženjem, kontekst razgovora, indikatori, transkript sa označenim signalima, izveštaj na kraju.
- Replay mod: pušta transkript (demo ili sopstveni `.txt` / `.json`) kao da je poziv uživo.
- Hvatanje zvuka iz Zooma preko PipeWire-a (mikrofon i zvučnici odvojeno), sa meračem zvuka.
- Analiza "Demo": pravila bez AI-ja (leksikoni en/sr, baseline sugovornika, tajming, kontradikcije).

**Još nije povezano:** Anthropic API, AWS Bedrock, Amazon Transcribe (govor u tekst).

**Instalacija (Ubuntu):**
```bash
sudo apt install ./app/dist/psych-asistent_0.1.0_amd64.deb
```

**Razvoj:**
```bash
cd app
npm install
npm test            # testovi analize
npm run dev         # pokreni u razvojnom modu
npm run dist        # napravi .deb u app/dist/
```
Ako se pokreće iz VS Code terminala, prvo `unset ELECTRON_RUN_AS_NODE`.
