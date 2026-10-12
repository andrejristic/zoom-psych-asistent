# Zoom Psych Asistent

AI conversation coach za Zoom pozive. Prati sugovornika u realnom vremenu i daje diskretne savjete.
Proizvod ZeravaTech (zeravatech.ca), trenutno u fazi planiranja.

- [PLAN.md](PLAN.md): zajednički plan (jezik, arhitektura, pravno, proizvod)
- [BUILD.md](BUILD.md): detaljan plan izgradnje po fazama
- [APP1-rijeci.md](APP1-rijeci.md): App 1, savjeti samo iz riječi
- [APP2-multimodal.md](APP2-multimodal.md): App 2, riječi + glas + lice

## Aplikacija (App 1, verzija 0.2.0)

Kod je u [app/](app/): Electron + React + TypeScript. Licenca je GPL-3.0-or-later, vidi [LICENSE](LICENSE) i [NOTICE](NOTICE).

**Šta radi:**
- Uzak prozor pored Zooma: savet sa obrazloženjem, kontekst razgovora, indikatori, transkript sa označenim signalima, izveštaj na kraju.
- **Claude analiza** preko korisnikovog Anthropic API ključa ili preko AWS Bedrocka (brzi model označava svaku izjavu, glavni daje savete, kontekst i izveštaj).
- **Govor u tekst uživo** preko Amazon Transcribe (engleski i srpski), sa korisnikovim AWS ključem. Mikrofon i zvučnici se hvataju odvojeno (PipeWire, Linux).
- Ključevi se drže samo u memoriji i nestaju kad se aplikacija zatvori.
- Replay mod i "Demo" analiza (pravila, bez AI) rade i bez ikakvih ključeva.

**Šta korisnik treba:** Anthropic API ključ (console.anthropic.com) i/ili AWS IAM access key sa dozvolama za Transcribe streaming i Bedrock. Slušalice za pozive uživo.

**Ograničenja:** hvatanje zvuka uživo samo na Linuxu; na Windowsu rade replay i analiza.

**Instalacija (Ubuntu):**
```bash
sudo apt install ./psych-asistent_0.2.0_amd64.deb   # sa stranice Releases
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
