# main.py - Backend de la aplicación MicroV con FastAPI

from fastapi import FastAPI, WebSocket, File, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
from dotenv import load_dotenv
import os
import base64
import cv2
import numpy as np
from openai import OpenAI

# Inicialización de la aplicación FastAPI
app = FastAPI()

# Cargar el modelo YOLOv8
model = YOLO('best.pt')

# Cargar las variables de entorno desde el archivo .env
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY") # <-- Cambiar aquí
client = OpenAI(api_key=api_key)

# Montar el directorio estático para servir archivos CSS, JS, imágenes, etc.
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """
    Sirve el archivo HTML principal de la aplicación.
    """
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

# --- Funciones de utilidad para el manejo de imágenes ---
def base64_to_cv2(base64_string):
    """
    Decodifica una cadena de imagen en Base64 a un objeto de imagen de OpenCV (cv2).
    """
    try:
        img_bytes = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decodificando Base64 a cv2: {e}")
        return None

def cv2_to_base64(image):
    """
    Codifica un objeto de imagen de OpenCV a una cadena de imagen en Base64.
    """
    try:
        ret, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 50])
        if not ret:
            raise ValueError("No se pudo codificar la imagen.")
        base64_string = base64.b64encode(buffer).decode('utf-8')
        return base64_string
    except Exception as e:
        print(f"Error codificando cv2 a Base64: {e}")
        return None

# --- Nuevo endpoint para el análisis de IA ---
@app.post("/analyze_with_ai/")
async def analyze_with_ai(data: dict):
    """
    Recibe una imagen en Base64 y un prompt para el análisis con Luna GPT-4.
    """
    image_base64 = data.get("image")
    prompt = data.get("prompt")
    
    if not image_base64 or not prompt:
        return JSONResponse(status_code=400, content={"response": "Faltan datos de imagen o prompt."})

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=1000,
        )
        ai_response = response.choices[0].message.content
        return JSONResponse(content={"response": ai_response})
    except Exception as e:
        print(f"Error en la llamada a la API de Luna AI: {e}")
        return JSONResponse(status_code=500, content={"response": "Error en el servicio de IA."})

# --- Endpoint para el análisis de imágenes estáticas ---
@app.post("/analyze_image/")
async def analyze_image_endpoint(file: UploadFile = File(...)):
    """
    Recibe una imagen estática, la analiza con el modelo YOLOv8,
    dibuja las cajas de detección y devuelve la imagen anotada en Base64.
    """
    try:
        # Leer la imagen del archivo subido
        img_bytes = await file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_np is None:
            return JSONResponse(status_code=400, content={"message": "No se pudo leer la imagen."})

        # Realizar la inferencia con YOLOv8
        results = model(img_np, verbose=False)
        
        # Dibujar los resultados en la imagen (la función .plot() de YOLO ya hace esto)
        annotated_image_np = results[0].plot()

        # Codificar la imagen anotada a Base64
        annotated_image_base64 = cv2_to_base64(annotated_image_np)

        return JSONResponse(content={"annotated_image_base64": annotated_image_base64})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- Endpoint para la conexión de WebSocket en tiempo real ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Maneja la conexión WebSocket para el streaming de video en tiempo real.
    """
    await websocket.accept()
    print("Conexión WebSocket aceptada.")
    try:
        # Bucle principal para recibir fotogramas del cliente
        while True:
            # Esperar el siguiente mensaje del cliente (se espera que sea una imagen en Base64)
            data = await websocket.receive_text()
            
            # Decodificar la imagen de Base64 a un formato procesable por OpenCV
            try:
                message = eval(data)
                base64_string = message['image']
                
            except Exception as e:
                print(f"Error decodificando el mensaje: {e}")
                continue

            frame = base64_to_cv2(base64_string)

            if frame is None:
                continue

            # Realizar la inferencia con el modelo YOLOv8
            results = model(frame, verbose=False)
            
            # Dibujar los resultados en la imagen
            annotated_frame = results[0].plot()

            # Codificar la imagen anotada de vuelta a Base64 para el cliente
            encoded_annotated_frame = cv2_to_base64(annotated_frame)
            
            if encoded_annotated_frame:
                # Enviar la imagen anotada de vuelta al cliente
                await websocket.send_json({"image": encoded_annotated_frame})

    except Exception as e:
        print(f"Error en el WebSocket: {e}")
    finally:
        print("Conexión WebSocket cerrada.")