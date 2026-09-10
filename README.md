[🇷🇺 Читать на русском языке](README_RU.md)

# Lectura — Smart AI-Powered Language Reading & Learning Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](docker-compose.prod.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/rustams1990/Lectura/releases)

**Lectura** is an open-source, full-featured language immersion and reading platform. It transforms foreign books, web articles, and YouTube videos into interactive learning experiences with instant AI context translation, morphological breakdown, IPA pronunciation, studio-quality speech synthesis, and Spaced Repetition (SRS) vocabulary tracking.

Supports both cloud AI (**Google Gemini**) and 100% offline self-hosted AI (**Ollama & Kokoro-82M TTS**).

---

## 🌟 Key Features

* 📖 **Interactive Reading Environment:**
  * Click on any word for immediate contextual translation powered by AI (taking sentence context into account).
  * IPA (International Phonetic Alphabet) transcription and native-speaker TTS audio.
  * Deep grammatical breakdown (part of speech, tense, gender, root lemma).
  * 2 contextual example sentences for each word.
  * Drag-to-select multi-word phrases, idioms, and phrasal verbs.
* 📚 **Multi-Format Content Importer:**
  * Import **EPUB, PDF, and TXT** books and documents.
  * Web article reader: paste any web article URL, and the built-in reader extracts clean text, stripping ads and clutter.
* 🎬 **Interactive YouTube Player:**
  * Paste any YouTube video link. Lectura parses synchronous subtitles into interactive clickable text.
  * Watch native videos while having line-by-line or word-by-word instant translations.
* 🧠 **Vocabulary Management & Spaced Repetition (SRS):**
  * Automated word classification: *New*, *Learning*, *Familiar*, *Mastered*.
  * Smart morphology engine: groups inflected word forms under their base dictionary lemma to eliminate duplicate vocabulary clutter.
  * Interactive practice modes: Flashcards, Spelling test, and Listening comprehension.
* 🔒 **Complete Privacy & Local Storage:**
  * All user notes, book progress, and vocabulary are stored locally in an embedded **SQLite** database.
  * Zero forced vendor lock-in: works completely offline with self-hosted Ollama models.
* 📱 **Multi-Device Sync & Cross-Platform:**
  * Web application (desktop and mobile browsers).
  * Native Android application built with Capacitor.

---

## 🚀 Quick Start & Installation

### Option 1: Docker (Recommended — Fastest & Easiest)
No Node.js or build toolchains required.

1. Ensure [Docker Desktop](https://www.docker.com/) is installed and running.
2. Clone the repository:
   ```bash
   git clone https://github.com/rustams1990/Lectura.git
   cd Lectura
   ```
3. Launch the container:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
4. Open **[http://localhost:8586](http://localhost:8586)** in your browser.
5. In the Lectura UI, click the **Settings** gear icon and paste your free **Google Gemini API Key**.

---

### Option 2: Windows 1-Click Launch (Without Docker)

1. Install [Node.js](https://nodejs.org/) (version 20+).
2. Download or clone this repository.
3. Double-click the **`run.bat`** file in the project root.
   * The script automatically verifies your environment, installs dependencies (`npm install`), creates configuration, and starts the server.
4. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Option 3: Developer Setup (Windows, macOS, Linux)

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/rustams1990/Lectura.git
   cd Lectura
   npm install
   ```
2. Copy environment sample:
   ```bash
   cp .env.example .env
   ```
3. Start development server with hot-reload:
   ```bash
   npm run dev
   ```
4. Access the web app at **`http://localhost:3000`**.

---

### Option 4: Ubuntu Server Deployment (Production)

1. Install Docker:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2
   sudo systemctl enable --now docker
   ```
2. Clone and start:
   ```bash
   git clone https://github.com/rustams1990/Lectura.git
   cd Lectura
   docker compose -f docker-compose.prod.yml up -d
   ```
   The application will be running at `http://YOUR_SERVER_IP:8586`.

3. **Fast Server Updates**:
   To update to the latest release in 15 seconds with automatic database backup:
   ```bash
   ./scripts/update-server.sh
   ```
   *The update script automatically snapshots your SQLite database into `./backups`, pulls the pre-built Docker image, and restarts the container.*

---

## 📱 Mobile App (Android)

Download the ready-to-install **`Lectura.apk`** from [GitHub Releases](https://github.com/rustams1990/Lectura/releases). 

Point the app to your server URL (e.g. `http://192.168.1.100:8586` or your public domain) to synchronize your reading progress, vocabulary, and stats across devices.

---

## ⚙️ AI Configuration

### Google Gemini (Cloud Mode)
* Get a free API key at [Google AI Studio](https://aistudio.google.com/).
* Enter the key directly in the application **Settings** modal (stored securely in your browser/account profile).

### Ollama (Offline / Self-Hosted Mode)
* Install [Ollama](https://ollama.com/) on your host machine or server.
* Pull a model of your choice:
  ```bash
  ollama run qwen2.5:3b
  ```
* In Lectura Settings, set **AI Provider** to **Local (Ollama)**.

### Local TTS (Kokoro-82M)
* For offline neural text-to-speech, run the Kokoro FastAPI container:
  ```bash
  docker run -d -p 8880:8880 ghcr.io/resemble-ai/kokoro-fastapi
  ```
* In Lectura Settings, select **Kokoro-82M / Local TTS** as the audio provider.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Framer Motion
* **Backend:** Node.js, Express, Better-SQLite3, TSX, esbuild
* **Mobile:** Capacitor (Android & iOS)
* **Storage:** SQLite (WAL mode, multi-account isolation)
* **Deployment:** Docker, GitHub Actions, GHCR

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
