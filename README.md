# 📸 Photo Roulette Web (Kahoot-Style Party Game)

A production-ready, mobile-first web clone of **Photo Roulette** designed to run statically on **GitHub Pages** with **zero backend server costs**.

Friends join via a 5-letter Room Code or QR code, contribute photos from their camera rolls, and race to guess who took each photo. Features client-side AI privacy filtering and a glowing emergency "VETO" button for photo owners!

---

## 🌟 Key Features

1. **100% Serverless & Zero Hosting Cost**:
   - Runs directly on GitHub Pages.
   - P2P multiplayer using **WebRTC via PeerJS** (free public PeerJS Cloud signaling server).
   - Star topology: Host coordinates game state, timers, scoring, and media distribution.

2. **Smart Client-Side Document & Privacy Filter**:
   - Runs locally in browser without sending any photo to any external server.
   - Dual-tier scanning:
     - **Canvas Heuristic Scanner**: Instant (< 50ms) edge density, high-contrast monochrome analysis, and text line detection.
     - **Transformers.js Image Classifier**: Quantized WebAssembly MobileNet classification flagging receipts, documents, screenshots, and IDs.
   - **Review & Exclusion Modal**: Players see what was flagged, can un-exclude false positives, or delete sensitive photos before entering the lobby.

3. **Kahoot-Style Party Game Loop**:
   - **Lobby**: Room QR code, player avatars & colors, settings (round duration, total rounds, progressive blur reveal, TV screen mode).
   - **3-Second Countdown**: Tension countdown with synth sound effects.
   - **Active Round**: Progressive blur sharpen reveal, speed-decay timer (1000 max down to 500 pts), 4–8 player answer buttons.
   - **Owner Panic Button**: The owner of the active photo sees a glowing red **"BURST / VETO"** button. If tapped, instantly blanks the screen to "CENSORED BY OWNER!" and awards 0 points.
   - **Answer Reveal**: Highlights the true owner, awards points, and tracks answering streaks (🔥 3 in a row!).
   - **Leaderboard**: Animated bar race showing ranking shifts.
   - **Final Podium**: 1st, 2nd, and 3rd place animated podium with full `canvas-confetti` and fun awards (*Fastest Guesser*, *Sneakiest Chameleon*, *Point Champion*).

4. **Web Audio SFX & Mobile Haptics**:
   - Synthesized Web Audio API sound effects (lobby pops, countdown beeps, whoosh, correct chime, wrong buzzer, panic siren, victory fanfare) with global mute toggle.
   - Mobile vibration haptics (`navigator.vibrate`) on answer clicks and timer warnings.

5. **Instant Demo / Solo Mode**:
   - Includes a 1-click Demo Mode with simulated bot players and sample party photos (including a simulated receipt to test the document scanner).

---

## 🚀 Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/<your-username>/PhotoRoulette.git
cd PhotoRoulette

# Install dependencies
npm install

# Start local dev server
npm run dev
```

Open `http://localhost:5173` in your browser.
To test multiplayer locally:
1. Tab 1: Click **Create Game (Host)**.
2. Tab 2: Click **Join Game (Player)** and enter the 5-letter room code (or click the room link).

---

## 📦 Deployment to GitHub Pages

This project is already pre-configured for automated GitHub Pages deployment:

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Initial Photo Roulette release"
   git push origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. The `.github/workflows/deploy.yml` workflow will automatically build and deploy your site to `https://<username>.github.io/<repo>/`.

---

## 🛠️ Project Structure

```
PhotoRoulette/
├── .github/workflows/deploy.yml # GitHub Actions automated Pages build & deploy
├── index.html                   # Mobile-viewport meta & dark theme
├── package.json
├── tsconfig.json
├── vite.config.ts               # Configured with relative base path ('./')
├── src/
│   ├── components/
│   │   ├── game/                # MediaViewer, TimerBar, PlayerGrid, PanicButton, RevealCard
│   │   ├── lobby/               # QRCodeDisplay, PlayerList, SettingsDrawer, MediaUploader
│   │   ├── ml/                  # DocumentScanner, ImagePreviewModal
│   │   ├── scoreboard/          # LeaderboardRace, Podium, ConfettiEffect
│   │   └── ui/                  # Button, Card, Badge, Modal, Avatar, SoundToggle
│   ├── hooks/
│   │   ├── useDocumentFilter.ts # ML + Canvas heuristic privacy scanner
│   │   ├── usePeerConnection.ts # WebRTC PeerJS star-topology & chunking
│   │   └── useSoundEffects.ts   # Web Audio API synthesizer & mobile haptics
│   ├── types/
│   │   └── game.ts              # Game, Player, Media, WebRTC message contracts
│   ├── utils/
│   │   ├── documentHeuristics.ts# Edge, contrast, & text density heuristics
│   │   ├── imageCompression.ts # Canvas 1280x720 JPEG compression & RTC chunking
│   │   ├── mockData.ts          # Sample photos and simulated bot players
│   │   └── scoring.ts           # Speed decay math, streak bonuses & party awards
│   ├── App.tsx                  # Main game state coordinator & view router
│   └── main.tsx                 # App entry point
```

---

## 🔒 Privacy & Security

- All image compression, document analysis, and media sharing happens **exclusively on the client devices** and over direct peer-to-peer WebRTC data channels.
- Photos are stored only ephemerally in memory (Blob URLs/Data URLs) and are wiped when the browser tab closes.
- Zero photos or user metadata are ever sent to any remote server or database.
