# AI Room Designer 🏠✨

An intelligent, full-stack AI platform that redesigns interior spaces based on text prompts while strictly preserving the original room geometry. Built with a **Next.js** frontend and a **FastAPI** backend, this project leverages state-of-the-art Generative AI models (SDXL, Stable Diffusion 1.5, and InstructPix2Pix) via Hugging Face `diffusers`.

## 🚀 Key Features

- **Multi-Engine Generation:** Choose between SDXL (Photorealistic), SD 1.5 (Fast & Lightweight), and InstructPix2Pix (Instruction-based editing).
- **Geometry Preservation:** Utilizes **ControlNet Depth Estimation** to lock the physical architecture (windows, walls, furniture layout) while completely changing materials, styles, and lighting.
- **Asynchronous Task Queue:** Implements **Redis** for robust background task management, preventing timeouts and handling long-running GPU inference smoothly.
- **Smart Prompt Engineering:** Features client-side Persian-to-English translation and engine-specific prompt formatting (e.g., descriptive prompts for SDXL vs. imperative commands for Pix2Pix).
- **Cloudflare Tunnels Integration:** Designed to run the heavy AI backend seamlessly on Google Colab (T4 GPU) while serving a local React frontend.
- **LCM-LoRA Acceleration:** Integrates Latent Consistency Models for real-time generation speeds (4-6 steps instead of 25+).

## 🧠 System Architecture

The project is strictly decoupled into a client-server architecture:

1. **Frontend (Next.js / React):** Handles image uploads, client-side translation, prompt formatting, polling backend status, and displaying a before/after comparison slider.
2. **Backend (FastAPI):** Exposes RESTful endpoints, validates images (OpenCV resolution/darkness checks), and pushes tasks to a Redis queue.
3. **AI Engine (PyTorch / Diffusers):** A memory-safe AI manager running on a GPU. It uses global locks and aggressive VRAM offloading techniques to prevent Out-Of-Memory (OOM) errors during model switching.

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, TypeScript, TailwindCSS (via JSX), React-Compare-Slider
- **Backend:** Python, FastAPI, Uvicorn, Redis
- **AI/ML:** PyTorch, Hugging Face Diffusers, OpenCV, ControlNet, DPT-Hybrid-MiDaS

## ⚙️ Installation & Setup

### 1. Backend Setup (Google Colab / Cloud GPU)

The backend is designed to run on a machine with at least a T4 GPU (16GB VRAM).

1. Open the backend notebook in Google Colab.
2. Run the environment setup cell to install dependencies (`torch`, `diffusers`, `fastapi`, `redis-server`, `cloudflared`, etc.).
3. Run the server cell.
4. The console will output a Cloudflare Tunnel URL (e.g., `https://xxxx.trycloudflare.com`). Copy this URL.

### 2. Frontend Setup (Local Environment)

1. Clone the repository:

   ```bash
   git clone [https://github.com/ErfanMasoudiBA/ai-room-designer.git](https://github.com/ErfanMasoudiBA/ai-room-designer.git)
   cd ai-room-designer/ai_room__frontend
   ```

2. Install dependencies:

```bash
npm install

```

3. Run the development server:

```bash
npm run dev

```

4. Open `http://localhost:3000` in your browser.
5. Click on **"تنظیمات سرور" (Server Settings)** in the UI and paste the Cloudflare Tunnel URL you copied from the backend.

## 💡 Usage Guide

1. **Upload a Photo:** Drag and drop a clear picture of a room.
2. **Enter a Style:** Type a description in Persian (e.g., "اتاق خواب مدرن با تم رنگی گرم"). The frontend will automatically translate and optimize this for the selected AI engine.
3. **Select an Engine:**

- **SDXL:** Best for cinematic, photorealistic outputs.
- **SD 1.5:** Best for fast previews.
- **Pix2Pix:** Best for direct commands (e.g., "Make the sofa leather").

4. **Fast Mode:** Toggle LCM on for 4-step generation, or off for high-quality 25-step generation.
5. **Compare:** Use the interactive slider to compare the original room with the generated output. All generations are saved in the session history.

## 🛡️ Error Handling & Security

- **Image Validation:** Rejects images under 256x256 resolution or images that are too dark (mean pixel intensity < 20) using OpenCV.
- **Memory Management:** Implements `_unload_all_except` and `enable_model_cpu_offload` to prevent VRAM overflow when switching between large models like SDXL and SD 1.5.

## 📄 License

This project is open-source and available under the [MIT License](https://www.google.com/search?q=LICENSE&utm_source=gemini).
