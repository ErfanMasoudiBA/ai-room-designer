"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import toast, { Toaster } from "react-hot-toast";

interface HistoryRecord {
  original_url: string;
  generated_url: string;
  prompt: string;
  engine: string;
  render_time?: number;
  peak_vram?: number;
  seed?: number;
}

interface Engine {
  id: string;
  name: string;
  eng: string;
  desc: string;
}

const ENGINES: Engine[] = [
  {
    id: "sdxl",
    name: "SDXL",
    eng: "ControlNet · Depth",
    desc: "بالاترین کیفیت، حفظ دقیق هندسه اتاق",
  },
  {
    id: "sd15",
    name: "SD 1.5",
    eng: "ControlNet · Depth",
    desc: "سبک‌تر و سریع‌تر، مناسب پیش‌نمایش",
  },
  {
    id: "pix2pix",
    name: "Pix2Pix",
    eng: "Instruction-based",
    desc: "ویرایش مستقیم با یک دستور متنی",
  },
];

const STYLE_SWATCHES = [
  { label: "مینیمال", dot: "#D8D2C4" },
  { label: "کلاسیک", dot: "#8B6B3D" },
  { label: "مدرن و گرم", dot: "#B5651D" },
  { label: "صنعتی و تاریک", dot: "#3A342A" },
  { label: "هالووین", dot: "#B5651D" },
];

const STEPS: { key: string; label: string }[] = [
  { key: "starting", label: "ارسال تصویر" },
  { key: "loading_model", label: "بارگذاری مدل" },
  { key: "generating", label: "رندر تصویر" },
  { key: "completed", label: "تکمیل" },
];

const DEFAULT_API_BASE_URL =
  "https://ext-hill-rome-routines.trycloudflare.com ";
const STORAGE_SESSION_KEY = "room_designer_session";
const STORAGE_API_KEY = "room_designer_api_base";
const MAX_POLL_ATTEMPTS = 200; // ~10 دقیقه با فاصله‌ی ۳ ثانیه

// ۱. تابع ترجمه مستقیم در مرورگر (بدون نیاز به بک‌اند)
const translatePrompt = async (text: string): Promise<string> => {
  const hasPersian = /[\u0600-\u06FF]/.test(text);
  if (!hasPersian) return text; // اگر انگلیسی است مستقیم برگردان

  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=fa|en`,
    );
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      return data.responseData.translatedText
        .toLowerCase()
        .replace(/[.,]/g, "");
    }
  } catch (e) {
    console.error("Frontend Translation Error:", e);
  }
  return text;
};

// ۲. تابع غنی‌سازی و فرمت‌دهی پرامپت متناسب با ذات هر موتور
const formatPromptForEngine = (
  translatedText: string,
  engineId: string,
): string => {
  if (engineId === "pix2pix") {
    // مدل Pix2Pix فقط فعل امری و کوتاه می‌فهمد
    return `make it ${translatedText}`;
  }
  // مدل‌های SD 1.5 و SDXL به توصیفات دقیق، نورپردازی و کیفیت بالا نیاز دارند
  return `A highly detailed, photorealistic interior design, ${translatedText}, architectural digest style, 8k`;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [lastMetrics, setLastMetrics] = useState<HistoryRecord | null>(null);

  const [prompt, setPrompt] = useState<string>("");
  const [engine, setEngine] = useState<string>("sdxl");
  const [fastMode, setFastMode] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const [apiBaseUrl, setApiBaseUrl] = useState<string>(DEFAULT_API_BASE_URL);
  const [apiInput, setApiInput] = useState<string>(DEFAULT_API_BASE_URL);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedApi = localStorage.getItem(STORAGE_API_KEY);
    if (savedApi) {
      setApiBaseUrl(savedApi);
      setApiInput(savedApi);
    }
    const savedSession = localStorage.getItem(STORAGE_SESSION_KEY);
    if (savedSession) {
      setSessionId(savedSession);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionId) fetchHistory(sessionId, apiBaseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const resolveUrl = useCallback(
    (path: string) => (path.startsWith("http") ? path : `${apiBaseUrl}${path}`),
    [apiBaseUrl],
  );

  const saveApiBaseUrl = () => {
    const trimmed = apiInput.trim().replace(/\/$/, "");
    if (!trimmed) return;
    setApiBaseUrl(trimmed);
    localStorage.setItem(STORAGE_API_KEY, trimmed);
    setShowSettings(false);
    toast.success("آدرس سرور به‌روزرسانی شد");
    if (sessionId) fetchHistory(sessionId, trimmed);
  };

  const fetchHistory = async (sid: string, base: string) => {
    try {
      const res = await fetch(`${base}/history/${sid}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history);
        return data.history as HistoryRecord[];
      }
    } catch {
      console.error("خطا در دریافت تاریخچه");
    }
    return null;
  };

  const handleFile = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResultImageUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const loadHistoryItemToSlider = (item: HistoryRecord) => {
    setOriginalImageUrl(resolveUrl(item.original_url));
    setResultImageUrl(resolveUrl(item.generated_url));
    setLastMetrics(item);
    toast.success("از تاریخچه به اسلایدر مقایسه منتقل شد");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile && !originalImageUrl) {
      toast.error("لطفاً ابتدا یک تصویر آپلود کنید");
      return;
    }

    setLoading(true);
    setCurrentStep(0);
    setLastMetrics(null);
    const toastId = toast.loading("در حال ترجمه و بهینه‌سازی دستور...");

    // 🌟 مرحله جدید: ترجمه و ساخت پرامپت نهایی در فرانت‌اند
    const translatedText = await translatePrompt(prompt);
    const finalEnginePrompt = formatPromptForEngine(translatedText, engine);

    toast.loading("در حال ارسال تصویر و دستورات به سرور...", { id: toastId });

    const formData = new FormData();
    if (selectedFile) formData.append("file", selectedFile);

    // ارسال پرامپت نهاییِ انگلیسی به موتور و ارسال متن فارسی برای نمایش در تاریخچه
    formData.append("style_prompt", finalEnginePrompt);
    formData.append("original_prompt", prompt); // ارسال متن خام کاربر
    formData.append("engine", engine);
    formData.append("fast_mode", String(fastMode));
    if (sessionId) formData.append("session_id", sessionId);

    try {
      const response = await fetch(`${apiBaseUrl}/generate-room/`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          // متن ارور دقیق را از بک‌اند (فیلد detail) می‌خواند
          const errorMessage =
            errorData.detail || "خطا در پردازش تصویر توسط سرور";
          toast.error(errorMessage, { id: toastId });
        } catch {
          toast.error("خطا در برقراری ارتباط با سرور", { id: toastId });
        }
        setLoading(false);
        setCurrentStep(-1);
        return;
      }

      const data = await response.json();
      const currentTaskId = data.task_id;
      const currentSession = data.session_id;

      if (!sessionId) {
        setSessionId(currentSession);
        localStorage.setItem(STORAGE_SESSION_KEY, currentSession);
      }

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        if (attempts > MAX_POLL_ATTEMPTS) {
          if (pollRef.current) clearInterval(pollRef.current);
          toast.error("زمان پردازش بیش از حد طولانی شد.", { id: toastId });
          setLoading(false);
          setCurrentStep(-1);
          return;
        }

        try {
          const statusRes = await fetch(
            `${apiBaseUrl}/status/${currentTaskId}`,
          );
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          const stepIdx = STEPS.findIndex((s) => s.key === statusData.status);
          if (stepIdx >= 0) setCurrentStep(stepIdx);
          toast.loading(statusData.message, { id: toastId });

          if (statusData.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setResultImageUrl(resolveUrl(statusData.generated_url));
            setOriginalImageUrl(resolveUrl(statusData.original_url));
            toast.success("طراحی با موفقیت تمام شد", { id: toastId });
            setLoading(false);
            const records = await fetchHistory(currentSession, apiBaseUrl);
            if (records && records.length > 0) setLastMetrics(records[0]);
          } else if (statusData.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            toast.error(`خطا: ${statusData.message}`, { id: toastId });
            setLoading(false);
            setCurrentStep(-1);
          }
        } catch {
          // یک شکست موقت در poll نباید کل جریان را متوقف کند
        }
      }, 3000);
    } catch {
      toast.error("ارتباط با سرور برقرار نشد.", { id: toastId });
      setLoading(false);
      setCurrentStep(-1);
    }
  };

  return (
    <main className="page" dir="rtl">
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#1D1A16",
            color: "#F2EEE6",
            border: "1px solid #3A342A",
            fontFamily: "Vazirmatn, sans-serif",
          },
        }}
      />

      <header className="masthead">
        <div className="masthead__title">
          <span className="masthead__kicker">استودیوی بازطراحی هوش مصنوعی</span>
          <h1>طراح هوشمند دکوراسیون داخلی</h1>
        </div>
        <div className="masthead__meta">
          <span className="status-dot" />
          <span>سه موتور تولید · پردازش صف‌بندی‌شده</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowSettings((v) => !v)}
          >
            تنظیمات سرور
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-bar">
          <label htmlFor="api-url">آدرس سرور (تونل Cloudflare)</label>
          <div className="settings-bar__row">
            <input
              id="api-url"
              type="text"
              value={apiInput}
              onChange={(e) => setApiInput(e.target.value)}
              placeholder="https://xxxx.trycloudflare.com"
            />
            <button
              type="button"
              onClick={saveApiBaseUrl}
              className="btn-ghost"
            >
              ذخیره
            </button>
          </div>
        </div>
      )}

      <div className="workspace">
        {/* ستون کنترل */}
        <form onSubmit={handleSubmit} className="panel">
          <section className="field">
            <span className="field__label">تصویر محیط فعلی</span>
            <div
              className={`dropzone ${dragActive ? "dropzone--active" : ""} ${previewUrl ? "dropzone--filled" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="پیش‌نمایش"
                  className="dropzone__preview"
                />
              ) : (
                <div className="dropzone__empty">
                  <span className="dropzone__hint">
                    عکس را بکشید و رها کنید یا کلیک کنید
                  </span>
                  <span className="dropzone__hint-sub">
                    JPG · PNG · WEBP — حداکثر ۱۰ مگابایت
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="dropzone__input"
              />
            </div>
          </section>

          <section className="field">
            <span className="field__label">سبک طراحی مورد نظر</span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثلاً: مدرن، مبلمان چوبی، نورپردازی گرم..."
              className="text-input"
            />
            <div className="swatches">
              {STYLE_SWATCHES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() =>
                    setPrompt(prompt ? `${prompt}، ${s.label}` : s.label)
                  }
                  className="swatch"
                >
                  <span className="swatch__dot" style={{ background: s.dot }} />
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="field">
            <span className="field__label">موتور تولید</span>
            <div className="engine-list">
              {ENGINES.map((eng) => (
                <button
                  type="button"
                  key={eng.id}
                  onClick={() => setEngine(eng.id)}
                  className={`engine-card ${engine === eng.id ? "engine-card--active" : ""}`}
                >
                  <div className="engine-card__head">
                    <span className="engine-card__name">{eng.name}</span>
                    <span className="engine-card__eng">{eng.eng}</span>
                  </div>
                  <span className="engine-card__desc">{eng.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="field field--row">
            <div>
              <span className="field__label">حالت سریع (LCM)</span>
              <span className="field__hint">
                {fastMode
                  ? "۴ تا ۶ استپ — مناسب دموی زنده"
                  : "۲۰ تا ۲۵ استپ — کیفیت نهایی بالاتر"}
              </span>
            </div>
            <button
              type="button"
              className={`toggle ${fastMode ? "toggle--on" : ""}`}
              onClick={() => setFastMode((v) => !v)}
              aria-pressed={fastMode}
            >
              <span className="toggle__knob" />
            </button>
          </section>

          <button
            type="submit"
            disabled={!previewUrl || loading}
            className="submit-btn"
          >
            {loading ? "در حال پردازش..." : "شروع بازطراحی"}
          </button>
        </form>

        {/* ستون نتیجه */}
        <section className="stage">
          {loading && (
            <div className="progress">
              {STEPS.map((step, idx) => (
                <div
                  key={step.key}
                  className={`progress__step ${idx <= currentStep ? "progress__step--done" : ""} ${idx === currentStep ? "progress__step--active" : ""}`}
                >
                  <span className="progress__dot" />
                  <span className="progress__label">{step.label}</span>
                </div>
              ))}
            </div>
          )}

          {originalImageUrl && resultImageUrl ? (
            <div className="result-frame">
              <div className="result-frame__labels">
                <span>قبل</span>
                <span>بعد</span>
              </div>
              <ReactCompareSlider
                itemOne={
                  <ReactCompareSliderImage
                    src={originalImageUrl}
                    alt="اتاق اصلی"
                  />
                }
                itemTwo={
                  <ReactCompareSliderImage
                    src={resultImageUrl}
                    alt="اتاق بازطراحی‌شده"
                  />
                }
                className="result-frame__slider"
              />
              {/* بخش جدید برای نمایش کامل متن دستور */}
              {lastMetrics?.prompt && (
                <div className="active-prompt">
                  <span className="active-prompt__label">دستور (Prompt)</span>
                  <p className="active-prompt__text">{lastMetrics.prompt}</p>
                </div>
              )}
              <div className="metrics">
                <div className="metrics__item">
                  <span className="metrics__value">
                    {lastMetrics?.engine?.toUpperCase() ?? "—"}
                  </span>
                  <span className="metrics__label">موتور</span>
                </div>
                <div className="metrics__item">
                  <span className="metrics__value">
                    {lastMetrics?.render_time
                      ? `${lastMetrics.render_time}s`
                      : "—"}
                  </span>
                  <span className="metrics__label">زمان رندر</span>
                </div>
                <div className="metrics__item">
                  <span className="metrics__value">
                    {lastMetrics?.peak_vram
                      ? `${Math.round(lastMetrics.peak_vram)}MB`
                      : "—"}
                  </span>
                  <span className="metrics__label">پیک VRAM</span>
                </div>
                <div className="metrics__item">
                  <span className="metrics__value">
                    {lastMetrics?.seed ?? "—"}
                  </span>
                  <span className="metrics__label">Seed</span>
                </div>
                <a href={resultImageUrl} download className="metrics__download">
                  دانلود نتیجه
                </a>
              </div>
            </div>
          ) : (
            !loading && (
              <div className="placeholder">
                <span>نتیجه‌ی بازطراحی اینجا نمایش داده می‌شود</span>
              </div>
            )
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className="gallery">
          <h2>گالری طراحی‌های پیشین</h2>
          <div className="gallery__grid">
            {history.map((item, index) => (
              <button
                key={`${item.generated_url}-${index}`}
                onClick={() => loadHistoryItemToSlider(item)}
                className="gallery__card"
                type="button"
              >
                <img
                  src={resolveUrl(item.generated_url)}
                  alt="طراحی پیشین"
                  className="gallery__img"
                />
                <div className="gallery__overlay">
                  <span className="gallery__tag">
                    {item.engine.toUpperCase()}
                  </span>
                  <span className="gallery__prompt" title={item.prompt}>
                    {item.prompt}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=Noto+Serif:wght@600;700&display=swap");

        :root {
          --bg: #14120f;
          --surface: #1d1a16;
          --surface-2: #262119;
          --border: #3a342a;
          --ink: #f2eee6;
          --muted: #a79c8a;
          --brass: #c9a227;
          --brass-soft: #8f7830;
          --danger: #c1533d;
        }

        * {
          box-sizing: border-box;
        }

        body {
          background: var(--bg);
          color: var(--ink);
          margin: 0;
        }

        .page {
          font-family: "Vazirmatn", sans-serif;
          min-height: 100vh;
          padding: 32px clamp(16px, 4vw, 64px) 80px;
          max-width: 1240px;
          margin: 0 auto;
        }

        .masthead {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 16px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 32px;
        }

        .masthead__kicker {
          display: block;
          color: var(--brass);
          font-size: 13px;
          margin-bottom: 6px;
        }

        .masthead h1 {
          font-family: "Noto Serif", serif;
          font-size: clamp(24px, 3.2vw, 34px);
          margin: 0;
          font-weight: 700;
        }

        .masthead__meta {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--muted);
          font-size: 13px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #6fae72;
          box-shadow: 0 0 0 3px rgba(111, 174, 114, 0.15);
        }

        .link-btn {
          background: none;
          border: none;
          color: var(--brass);
          font-family: inherit;
          font-size: 13px;
          cursor: pointer;
          padding: 0;
        }

        .settings-bar {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .settings-bar label {
          display: block;
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .settings-bar__row {
          display: flex;
          gap: 8px;
        }

        .settings-bar input {
          flex: 1;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          color: var(--ink);
          font-family: inherit;
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid var(--brass);
          color: var(--brass);
          border-radius: 8px;
          padding: 0 16px;
          cursor: pointer;
          font-family: inherit;
        }

        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
          gap: 28px;
          align-items: start;
        }

        @media (max-width: 860px) {
          .workspace {
            grid-template-columns: 1fr;
          }
        }

        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .field--row {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }

        .field__label {
          font-size: 14px;
          font-weight: 600;
        }

        .field__hint {
          display: block;
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }

        .dropzone {
          position: relative;
          height: 190px;
          border: 1.5px dashed var(--border);
          border-radius: 10px;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.02) 1px,
              transparent 1px
            );
          background-size: 20px 20px;
          overflow: hidden;
          transition: border-color 0.15s ease;
        }

        .dropzone--active {
          border-color: var(--brass);
        }

        .dropzone--filled {
          border-style: solid;
        }

        .dropzone__input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .dropzone__empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: var(--muted);
          text-align: center;
          padding: 0 20px;
        }

        .dropzone__hint {
          font-size: 14px;
          color: var(--ink);
        }

        .dropzone__hint-sub {
          font-size: 12px;
        }

        .dropzone__preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .text-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          color: var(--ink);
          font-family: inherit;
          font-size: 14px;
        }

        .text-input:focus-visible,
        .btn-ghost:focus-visible,
        .submit-btn:focus-visible {
          outline: 2px solid var(--brass);
          outline-offset: 2px;
        }

        .swatches {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .swatch {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 6px 12px;
          color: var(--muted);
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
        }

        .swatch:hover {
          color: var(--ink);
          border-color: var(--brass-soft);
        }

        .swatch__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }

        .engine-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .engine-card {
          text-align: right;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          cursor: pointer;
          font-family: inherit;
          color: var(--ink);
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: border-color 0.15s ease;
        }

        .engine-card--active {
          border-color: var(--brass);
          background: rgba(201, 162, 39, 0.08);
        }

        .engine-card__head {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .engine-card__name {
          font-weight: 700;
        }

        .engine-card__eng {
          color: var(--muted);
          font-size: 11px;
        }

        .engine-card__desc {
          color: var(--muted);
          font-size: 12px;
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: var(--bg);
          border: 1px solid var(--border);
          position: relative;
          cursor: pointer;
        }

        .toggle--on {
          border-color: var(--brass-soft);
          background: rgba(201, 162, 39, 0.25);
        }

        .toggle__knob {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--muted);
          transition:
            transform 0.15s ease,
            background 0.15s ease;
        }

        .toggle--on .toggle__knob {
          transform: translateX(-20px);
          background: var(--brass);
        }

        .submit-btn {
          background: var(--brass);
          color: #14120f;
          border: none;
          border-radius: 10px;
          padding: 14px;
          font-family: inherit;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .submit-btn:disabled {
          background: var(--border);
          color: var(--muted);
          cursor: not-allowed;
        }

        .submit-btn:not(:disabled):hover {
          background: #ddb534;
        }

        .stage {
          min-height: 300px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .progress {
          display: flex;
          gap: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }

        .progress__step {
          flex: 1;
          text-align: center;
          position: relative;
          color: var(--muted);
          font-size: 12px;
        }

        .progress__dot {
          display: block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--border);
          margin: 0 auto 8px;
        }

        .progress__step--done .progress__dot {
          background: var(--brass-soft);
        }

        .progress__step--active .progress__dot {
          background: var(--brass);
          box-shadow: 0 0 0 4px rgba(201, 162, 39, 0.2);
        }

        .progress__step--active .progress__label {
          color: var(--ink);
        }

        .placeholder {
          flex: 1;
          min-height: 300px;
          border: 1px solid var(--border);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          font-size: 14px;
          background: repeating-linear-gradient(
            135deg,
            var(--surface),
            var(--surface) 10px,
            var(--surface-2) 10px,
            var(--surface-2) 11px
          );
        }

        .result-frame {
          border: 1px solid var(--brass-soft);
          border-radius: 14px;
          padding: 10px;
          background: var(--surface);
        }

        .result-frame__labels {
          display: flex;
          justify-content: space-between;
          padding: 4px 8px 10px;
          color: var(--muted);
          font-size: 12px;
        }

        .result-frame__slider {
          height: 460px;
          border-radius: 8px;
          overflow: hidden;
        }

        .metrics {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 24px;
          padding: 16px 8px 6px;
          border-top: 1px solid var(--border);
          margin-top: 14px;
        }

        .metrics__item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metrics__value {
          font-variant-numeric: tabular-nums;
          font-size: 15px;
          font-weight: 700;
          color: var(--brass);
        }

        .metrics__label {
          font-size: 11px;
          color: var(--muted);
        }

        .metrics__download {
          margin-inline-start: auto;
          color: var(--ink);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          text-decoration: none;
        }

        .metrics__download:hover {
          border-color: var(--brass);
        }

        .gallery {
          margin-top: 56px;
          border-top: 1px solid var(--border);
          padding-top: 32px;
        }

        .gallery h2 {
          font-family: "Noto Serif", serif;
          font-size: 22px;
          margin: 0 0 20px;
        }

        .gallery__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }

        .gallery__card {
          position: relative;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          padding: 0;
          cursor: pointer;
          background: var(--surface);
          height: 170px;
        }

        .gallery__img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .gallery__card:hover .gallery__img {
          transform: scale(1.05);
        }

        .gallery__overlay {
          position: absolute;
          inset: auto 0 0 0;
          background: linear-gradient(
            to top,
            rgba(20, 18, 15, 0.92),
            transparent
          );
          padding: 24px 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: right;
        }

        .gallery__tag {
          color: var(--brass);
          font-size: 11px;
          font-weight: 700;
        }

        .gallery__prompt {
          color: var(--ink);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .active-prompt {
          padding: 16px 10px 0;
          border-top: 1px solid var(--border);
          margin-top: 14px;
        }

        .active-prompt__label {
          display: block;
          font-size: 11px;
          color: var(--muted);
          margin-bottom: 6px;
        }

        .active-prompt__text {
          margin: 0;
          font-size: 14px;
          color: var(--ink);
          line-height: 1.6;
          word-wrap: break-word;
        }

        /* اصلاح فاصله مرز بالایی بخش متریک‌ها که حالا زیر پرامپت قرار می‌گیرد */
        .result-frame .metrics {
          border-top: none;
          margin-top: 0;
          padding-top: 12px;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}
