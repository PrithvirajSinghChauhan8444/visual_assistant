# 🎙️ Diana AI - Local Voice Synthesis Pipeline

This document outlines the architecture for creating a **zero-latency, fully offline, and zero-API-cost** custom voice pipeline for the Diana AI companion. This design is specifically structured to run locally on your hardware and can be seamlessly integrated into your existing bot backend.

---

## 📌 1. System Overview

Standard neural Text-to-Speech (TTS) models are often too slow for real-time conversation or lack the specific character voice required. To bypass this limitation, we use a hybrid approach: **generating extremely fast, generic baseline audio, and then rapidly morphing it into the target character's voice.**

### 🔄 The Pipeline Flow

```mermaid
graph LR
    A["🤖 Bot Text Output"] --> B["⚡ Piper TTS"]
    B --> C["💾 Generic Audio Buffer"]
    C --> D["🎭 RVC v2 Inference"]
    D --> E["🔊 Diana's Voice"]
    
    style A fill:#4F46E5,stroke:#312E81,stroke-width:2px,color:#ffffff
    style B fill:#10B981,stroke:#065F46,stroke-width:2px,color:#ffffff
    style C fill:#F59E0B,stroke:#92400E,stroke-width:2px,color:#ffffff
    style D fill:#EC4899,stroke:#9D174D,stroke-width:2px,color:#ffffff
    style E fill:#8B5CF6,stroke:#5B21B6,stroke-width:2px,color:#ffffff
```

---

## ⚡ 2. Phase 1: Fast Text-to-Speech (Piper)

**Piper** is a fast, local neural text-to-speech engine optimized for consumer hardware. Its primary role in this pipeline is to act as the raw "actor," reading the text instantly to create a phonetic baseline.

### 🌟 Key Characteristics
* **Speed:** Generates audio significantly faster than real-time, preventing awkward pauses in conversation.
* **Offline Capability:** Requires no internet connection once the voice model is downloaded.
* **Model Selection:** While the final voice will sound like Diana, the *baseline* Piper model matters. You should select a Piper voice (e.g., a standard US English female voice) that closely matches Diana's natural pacing and intonation.

> [!TIP]
> **Baseline Matching:** Choosing a baseline voice with a similar pitch and cadence makes the subsequent RVC translation much cleaner and prevents robotic artifacts.

### 💾 Data Handoff
Instead of saving the audio to a hard drive (which introduces read/write latency), the orchestrator script should capture Piper's output as an **in-memory WAV stream** (a raw byte buffer) to immediately pass to the next phase.

---

## 🎭 3. Phase 2: Voice Morphing (RVC v2)

**Retrieval-based Voice Conversion (RVC)** is responsible for the actual voice cloning. It acts as a real-time vocal filter, shifting the acoustic properties of the generic Piper audio to match the trained voice of Diana.

### ⚙️ The Conversion Process

1. **Pitch Extraction:** RVC analyzes the incoming Piper audio using a pitch extraction algorithm (like `rmvpe` or `harvest`).
   * *Recommendation:* `rmvpe` is highly recommended for real-time speech as it handles pitch tracking cleanly with minimal artifacts.
2. **Feature Retrieval:** The software compares the extracted audio features against the trained Diana voice model (a `.pth` file) and an optional feature index file (`.index`) to ensure her specific accent and vocal quirks are applied.
3. **Synthesis:** RVC outputs the newly morphed audio, preserving the emotional cadence of the Piper TTS but replacing the vocal cords with Diana's.

> [!IMPORTANT]
> **Prerequisites for RVC Training:**
> * **Audio Dataset:** 10 to 15 minutes of exceptionally clean, background-noise-free audio clips of Diana speaking.
> * **Separation Tools:** If ripping audio from gameplay or other mixed media, tools like **Ultimate Vocal Remover (UVR)** are necessary to strip away background music, sound effects, and reverb.

---

## 🛠️ 4. Integration & The Python Orchestrator

To merge this pipeline with your existing bot, a central orchestrator script is required to handle the data flow asynchronously.

### 🚀 Latency Optimization Strategies

* **Sentence Chunking:** Instead of waiting for your LLM (Ollama) to generate an entire paragraph before speaking, the orchestrator should split the incoming text stream by punctuation (periods, commas). It sends the first sentence through Piper and RVC immediately, playing the audio while the subsequent sentences are still generating.
* **GPU Acceleration:** While Piper can run effortlessly on the CPU, the RVC inference should ideally be routed through your GPU (via PyTorch/CUDA or DirectML depending on your hardware) to ensure the voice morphing happens in milliseconds.
* **Memory Management:** Passing audio as standard I/O pipes or utilizing `BytesIO` buffers in Python ensures the hard drive is never a bottleneck.

---

## 📋 5. Next Steps for Implementation

- [ ] **Dataset Assembly:** Gather and clean audio files for Diana to train the initial RVC model.
- [ ] **Pipeline Testing:** Run a static text string through Piper and pipe it to RVC via command-line arguments to test system latency before writing the integration logic.
- [ ] **Bot Integration:** Connect the input of this pipeline to the text output stream of your existing AI logic.
