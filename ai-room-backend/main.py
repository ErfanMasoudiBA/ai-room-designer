import io
import json
import os
import uuid

import redis
from ai_engine import AIModelManager

# وارد کردن مترجم جایگزین در کنار گوگل
from deep_translator import GoogleTranslator, MyMemoryTranslator
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

app = FastAPI(title="AI Room Designer API")

redis_client = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
ai_manager = AIModelManager()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static/uploads", exist_ok=True)
os.makedirs("static/generated", exist_ok=True)


# 🌟 تابع جدید: مدیریت خطای ترجمه و استفاده از سرویس جایگزین
def safe_translate(text: str) -> str:
    try:
        # تلاش اول: استفاده از گوگل
        return GoogleTranslator(source="auto", target="en").translate(text)
    except Exception as e:
        print(f"Google Translate failed: {e}. Switching to alternative...")
        try:
            # تلاش دوم: استفاده از مترجم MyMemory
            return MyMemoryTranslator(source="auto", target="en").translate(text)
        except Exception as e2:
            print(f"All translators failed: {e2}. Using original text.")
            # اگر همه قطع بودند، حداقل سرور کرش نکند
            return text


@app.post("/generate-room/")
async def generate_room(
    file: UploadFile = File(...),
    style_prompt: str = Form(...),
    engine: str = Form("sd15"),
    session_id: str = Form(None),
):
    if engine not in ["sd15", "pix2pix", "sdxl"]:
        raise HTTPException(status_code=400, detail="Invalid engine selected")

    if not session_id:
        session_id = str(uuid.uuid4())

    file_id = str(uuid.uuid4())[:8]
    original_path = f"static/uploads/{file_id}_{file.filename}"
    with open(original_path, "wb") as buffer:
        buffer.write(await file.read())

    # 🌟 استفاده از تابع ترجمه امن به جای کد قبلی
    translated_style = safe_translate(style_prompt)

    if engine == "pix2pix":
        full_prompt = translated_style
    else:
        full_prompt = f"A highly detailed, photorealistic interior design, {translated_style}, architectural digest style, 8k"

    negative_prompt = (
        "ugly, deformed, blurry, poor quality, watermark, artificial, bad architecture"
    )

    init_image = Image.open(original_path).convert("RGB")
    try:
        output_image = ai_manager.generate(
            init_image, full_prompt, negative_prompt, engine
        )
    except Exception as e:
        # نمایش خطای دقیق اگر مدل‌های هوش مصنوعی به مشکل خوردند
        print(f"AI Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    generated_path = f"static/generated/{file_id}_result.png"
    output_image.save(generated_path)

    history_record = {
        "original_url": f"http://127.0.0.1:8000/{original_path}",
        "generated_url": f"http://127.0.0.1:8000/{generated_path}",
        "prompt": style_prompt,
        "engine": engine,
    }
    redis_client.lpush(f"history:{session_id}", json.dumps(history_record))

    return JSONResponse(content={"session_id": session_id, "data": history_record})


@app.get("/history/{session_id}")
async def get_history(session_id: str):
    records = redis_client.lrange(f"history:{session_id}", 0, -1)
    history = [json.loads(record) for record in records]
    return JSONResponse(content={"session_id": session_id, "history": history})
