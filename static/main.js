// static/main.js - Gestiona la interfaz completa: imagen estática y video en tiempo real.

document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias de los elementos del DOM ---
    const fileInput = document.getElementById('file-input');
    const fileExploreBtn = document.getElementById('fileExploreBtn');
    const uploadedImage = document.getElementById('uploadedImage');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const scanBtn = document.getElementById('scanBtn');
    const boxBtn = document.getElementById('boxBtn');
    const detectionOverlay = document.getElementById('detectionOverlay');
    const videoFeed = document.getElementById('videoFeed');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const stopCameraBtn = document.getElementById('stopCameraBtn');

    // Referencias a los nuevos elementos del panel de IA
    const aiChatWindow = document.getElementById('aiChatWindow');
    const promptBtn1 = document.getElementById('promptBtn1');
    const promptBtn2 = document.getElementById('promptBtn2');
    const aiChatContainer = document.getElementById('aiChatContainer');
    const aiChatToggleBtn = document.getElementById('aiChatToggleBtn');
    const closeAIPanelBtn = document.getElementById('closeAIPanelBtn');

    const ctx = detectionOverlay.getContext('2d');
    let ws = null;
    let canvasInterval = null;
    let isDrawing = false;
    let startX, startY;
    let originalFile = null;

    // --- Variables de estado unificadas ---
    let currentMode = 'welcome'; // 'welcome', 'static_image', 'realtime_video'

    // --- Funciones de utilidad ---
    const showModal = (message, isTemporary = false) => {
        // Elimina cualquier modal existente para evitar superposiciones
        const existingModal = document.querySelector('.fixed.inset-0.flex');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50';
        modal.innerHTML = `
            <div class="bg-button-dark p-6 rounded-lg shadow-xl text-text-light">
                <p>${message}</p>
                ${isTemporary ? '' : '<button class="mt-4 px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-colors duration-200">Cerrar</button>'}
            </div>
        `;
        document.body.appendChild(modal);
        if (!isTemporary) {
            modal.querySelector('button').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        }
        return modal;
    };

    // Función para mostrar un mensaje en el chat con los estilos correctos
    const displayMessage = (text, sender) => {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('p-2', 'rounded-lg', 'mb-2', 'max-w-[85%]');
        
        if (sender === 'user') {
            messageDiv.classList.add('bg-white', 'text-background-dark', 'ml-auto');
        } else { // 'ai'
            // Cambia el color de fondo de las cajas de Luna a un gris oscuro
            messageDiv.classList.add('bg-button-dark', 'text-white', 'mr-auto');
        }
        
        messageDiv.innerText = text;
        aiChatWindow.appendChild(messageDiv);
        aiChatWindow.scrollTop = aiChatWindow.scrollHeight; // Auto-scroll
        return messageDiv; // Devuelve el elemento para que pueda ser actualizado
    };

    const toggleChatPanel = () => {
        aiChatContainer.classList.toggle('w-0');
        aiChatContainer.classList.toggle('w-80'); // Ancho fijo para el panel de chat
    };

    // --- Lógica del modo de imagen estática ---
    const startStaticImageMode = async (file) => {
        if (!file || !file.type.startsWith('image/')) {
            showModal('Tipo de archivo no soportado. Por favor, sube una imagen JPG o PNG.');
            return;
        }

        stopCamera();
        currentMode = 'static_image';
        originalFile = file;
        welcomeMessage.style.display = 'none';
        videoFeed.style.display = 'none';
        detectionOverlay.style.backgroundImage = 'none';
        detectionOverlay.style.display = 'none';

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage.src = e.target.result;
            uploadedImage.style.display = 'block';
            // Envía la imagen completa a la IA para una descripción inicial
            sendInitialAnalysis(e.target.result.split(',')[1]);
        };
        reader.readAsDataURL(file);
    };

    async function sendInitialAnalysis(imageBase64) {
        const prompt = "Analiza esta imagen de muestra clínica. Describe el tipo de muestra, los elementos o células visibles, y un conteo aproximado de cada tipo, si es posible. Sé conciso y objetivo.";
        sendToLunaAI(imageBase64, prompt);
    }

    async function runInference(file) {
        const loadingModal = showModal('Analizando la imagen con YOLOv8...', true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch('/analyze_image/', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error(`Error en el servidor: ${response.status}`);
            const result = await response.json();
            
            if (result.annotated_image_base64) {
                uploadedImage.src = `data:image/png;base64,${result.annotated_image_base64}`;
            }
            showModal('¡Análisis completado!');
        } catch (error) {
            console.error('Error durante la detección de YOLOv8:', error);
            showModal('Error al conectar con el servicio de análisis.');
        } finally {
            if (loadingModal) loadingModal.remove();
        }
    }

    const toggleDetections = () => {
        if (currentMode !== 'static_image') {
            showModal('Esta función solo es para imágenes estáticas.');
            return;
        }
        if (uploadedImage.src.includes('data:image/png;base64,')) {
            const reader = new FileReader();
            reader.onload = (e) => { uploadedImage.src = e.target.result; };
            reader.readAsDataURL(originalFile);
        } else {
            runInference(originalFile);
        }
    };

    // --- Lógica del encajonamiento manual ---
    const enableManualDrawing = () => {
        const imgRect = uploadedImage.getBoundingClientRect();
        detectionOverlay.width = imgRect.width;
        detectionOverlay.height = imgRect.height;
        detectionOverlay.style.position = 'absolute';
        detectionOverlay.style.top = `${imgRect.top}px`;
        detectionOverlay.style.left = `${imgRect.left}px`;
        detectionOverlay.style.display = 'block';
        detectionOverlay.classList.add('drawing-cursor');
        
        // Eventos para mouse (computadora)
        detectionOverlay.addEventListener('mousedown', startDrawingMouse);
        detectionOverlay.addEventListener('mousemove', drawWhileMovingMouse);
        detectionOverlay.addEventListener('mouseup', endDrawingMouse);

        // Eventos para touch (dispositivos móviles)
        detectionOverlay.addEventListener('touchstart', startDrawingTouch);
        detectionOverlay.addEventListener('touchmove', drawWhileMovingTouch);
        detectionOverlay.addEventListener('touchend', endDrawingTouch);
    };
    
    const disableManualDrawing = () => {
        detectionOverlay.style.display = 'none';
        ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        detectionOverlay.classList.remove('drawing-cursor');
        
        // Eliminar eventos de mouse
        detectionOverlay.removeEventListener('mousedown', startDrawingMouse);
        detectionOverlay.removeEventListener('mousemove', drawWhileMovingMouse);
        detectionOverlay.removeEventListener('mouseup', endDrawingMouse);

        // Eliminar eventos de touch
        detectionOverlay.removeEventListener('touchstart', startDrawingTouch);
        detectionOverlay.removeEventListener('touchmove', drawWhileMovingTouch);
        detectionOverlay.removeEventListener('touchend', endDrawingTouch);
    };

    // Lógica para mouse
    const startDrawingMouse = (event) => {
        isDrawing = true;
        const rect = detectionOverlay.getBoundingClientRect();
        startX = event.clientX - rect.left;
        startY = event.clientY - rect.top;
        ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
    };
    
    const drawWhileMovingMouse = (event) => {
        if (!isDrawing) return;
        const rect = detectionOverlay.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    };
    
    const endDrawingMouse = (event) => {
        if (!isDrawing) return;
        isDrawing = false;
        const rect = detectionOverlay.getBoundingClientRect();
        const endX = event.clientX - rect.left;
        const endY = event.clientY - rect.top;
        const boxWidth = Math.abs(endX - startX);
        const boxHeight = Math.abs(endY - startY);
        const boxX = Math.min(startX, endX);
        const boxY = Math.min(startY, endY);
        
        if (boxWidth > 10 && boxHeight > 10) {
            // El encajonamiento envía la imagen recortada a la IA
            cropAndAnalyze(boxX, boxY, boxWidth, boxHeight, "Describe exactamente lo que se ve en esta imagen recortada. Sé lo más específico posible e identifica el objeto/célula, etc.");
        } else {
            showModal("Por favor, dibuja un recuadro más grande para el análisis.");
            ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        }
    };

    // Lógica para touch
    const startDrawingTouch = (event) => {
        isDrawing = true;
        const rect = detectionOverlay.getBoundingClientRect();
        const touch = event.touches[0];
        startX = touch.clientX - rect.left;
        startY = touch.clientY - rect.top;
        ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        event.preventDefault(); // Previene el desplazamiento de la pantalla
    };

    const drawWhileMovingTouch = (event) => {
        if (!isDrawing) return;
        const rect = detectionOverlay.getBoundingClientRect();
        const touch = event.touches[0];
        const currentX = touch.clientX - rect.left;
        const currentY = touch.clientY - rect.top;
        ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        event.preventDefault(); // Previene el desplazamiento de la pantalla
    };

    const endDrawingTouch = (event) => {
        if (!isDrawing) return;
        isDrawing = false;
        const rect = detectionOverlay.getBoundingClientRect();
        const touch = event.changedTouches[0];
        const endX = touch.clientX - rect.left;
        const endY = touch.clientY - rect.top;
        const boxWidth = Math.abs(endX - startX);
        const boxHeight = Math.abs(endY - startY);
        const boxX = Math.min(startX, endX);
        const boxY = Math.min(startY, endY);
        
        if (boxWidth > 10 && boxHeight > 10) {
            // El encajonamiento envía la imagen recortada a la IA
            cropAndAnalyze(boxX, boxY, boxWidth, boxHeight, "Describe exactamente lo que se ve en esta imagen recortada. Sé lo más específico posible e identifica el objeto/célula, etc.");
        } else {
            showModal("Por favor, dibuja un recuadro más grande para el análisis.");
            ctx.clearRect(0, 0, detectionOverlay.width, detectionOverlay.height);
        }
        event.preventDefault(); // Previene el desplazamiento de la pantalla
    };

    const cropAndAnalyze = (x, y, width, height, prompt) => {
        let sourceImage = null;
        if (currentMode === 'static_image') {
            sourceImage = uploadedImage;
        } else if (currentMode === 'realtime_video') {
            sourceImage = videoFeed;
        }
        
        if (!sourceImage) {
            showModal("No hay fuente de imagen para encajonar.");
            return;
        }

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        const originalWidth = sourceImage.naturalWidth || sourceImage.videoWidth;
        const originalHeight = sourceImage.naturalHeight || sourceImage.videoHeight;
        const displayedWidth = sourceImage.offsetWidth;
        const displayedHeight = sourceImage.offsetHeight;
        const scaleX = originalWidth / displayedWidth;
        const scaleY = originalHeight / displayedHeight;
        const cropX = x * scaleX;
        const cropY = y * scaleY;
        const cropWidth = width * scaleX;
        const cropHeight = height * scaleY;
        tempCanvas.width = cropWidth;
        tempCanvas.height = cropHeight;
        tempCtx.drawImage(sourceImage, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const croppedImageBase64 = tempCanvas.toDataURL('image/jpeg').split(',')[1];
        sendToLunaAI(croppedImageBase64, prompt);
    };

    // --- Lógica del modo de video en tiempo real ---
    const startCamera = async () => {
        try {
            stopWebSocket();
            currentMode = 'realtime_video';
            uploadedImage.style.display = 'none';
            welcomeMessage.style.display = 'none';
            detectionOverlay.style.backgroundImage = 'none';
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: {
                    facingMode: {
                        exact: 'environment'
                    }
                }
            });
            videoFeed.srcObject = stream;
            videoFeed.style.display = 'block';
            detectionOverlay.style.display = 'block'; // Mostrar el overlay para el encajonamiento en video

            videoFeed.onloadedmetadata = () => {
                // No iniciar WebSocket aquí, la cámara debe funcionar sin interrupción
            };
        } catch (err) {
            console.error('Error al acceder a la cámara:', err);
            showModal('Error al acceder a la cámara. Por favor, asegúrate de que el navegador tiene los permisos necesarios.');
        }
    };

    const stopCamera = () => {
        const stream = videoFeed.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
        }
        videoFeed.srcObject = null;
        videoFeed.style.display = 'none';
        welcomeMessage.style.display = 'block';
        detectionOverlay.style.display = 'none';
        stopWebSocket(); // Asegurarse de detener el WebSocket si estuviera corriendo
        currentMode = 'welcome';
    };

    const startWebSocket = () => {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        ws = new WebSocket(`ws://localhost:8000/ws`);
        ws.onopen = () => { console.log("Conexión WebSocket establecida."); startSendingFrames(); };
        ws.onmessage = (event) => {
            const imageData = JSON.parse(event.data).image;
            if (imageData) {
                detectionOverlay.style.backgroundImage = `url(data:image/jpeg;base64,${imageData})`;
                detectionOverlay.style.backgroundSize = 'contain';
                detectionOverlay.style.backgroundRepeat = 'no-repeat';
                detectionOverlay.style.backgroundPosition = 'center';
            }
        };
        ws.onclose = () => { console.log("Conexión WebSocket cerrada."); stopSendingFrames(); };
        ws.onerror = (error) => { console.error("Error en WebSocket:", error); stopWebSocket(); };
    };

    const stopWebSocket = () => {
        if (ws) {
            ws.close();
            ws = null;
        }
    };

    const startSendingFrames = () => {
        if (canvasInterval) return;
        const canvas = document.createElement('canvas');
        canvasInterval = setInterval(() => {
            if (videoFeed.readyState === 4) {
                canvas.width = videoFeed.videoWidth;
                canvas.height = videoFeed.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
                const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ image: base64Image }));
                }
            }
        }, 100);
    };

    const stopSendingFrames = () => {
        if (canvasInterval) {
            clearInterval(canvasInterval);
            canvasInterval = null;
        }
    };

    // FUNCIÓN DE ANÁLISIS MEJORADA
    async function sendToLunaAI(imageBase64, prompt) {
        // Agrega el mensaje del usuario al chat
        displayMessage(prompt, 'user');
        
        // Agrega el mensaje de "analizando..." y obtén su referencia
        const loadingMessage = displayMessage('Luna está analizando...', 'ai');

        try {
            const response = await fetch('/analyze_with_ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageBase64, prompt: prompt }),
            });
            
            const result = await response.json();
            
            // Reemplaza el mensaje de "analizando..." con la respuesta de la IA
            loadingMessage.innerText = result.response;
        } catch (error) {
            console.error('Error al comunicarse con la IA:', error);
            // Si hay un error, actualiza el mensaje de carga con un mensaje de error
            loadingMessage.innerText = 'Error: No se pudo conectar con Luna AI. Por favor, intenta de nuevo.';
        }
    }

    async function captureAndAnalyze(prompt) {
        if (currentMode === 'static_image') {
            const canvas = document.createElement('canvas');
            canvas.width = uploadedImage.naturalWidth;
            canvas.height = uploadedImage.naturalHeight;
            const tempCtx = canvas.getContext('2d');
            tempCtx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            sendToLunaAI(imageBase64, prompt);
        } else if (currentMode === 'realtime_video') {
            if (videoFeed.readyState === 4) {
                const canvas = document.createElement('canvas');
                canvas.width = videoFeed.videoWidth;
                canvas.height = videoFeed.videoHeight;
                const tempCtx = canvas.getContext('2d');
                tempCtx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
                const imageBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
                sendToLunaAI(imageBase64, prompt);
            } else {
                showModal('Video no está listo para el análisis.');
            }
        } else {
            showModal('Por favor, inicia la cámara o sube una imagen primero.');
        }
    }

    // --- Event Listeners Globales ---
    fileExploreBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) startStaticImageMode(file);
    });

    startCameraBtn.addEventListener('click', startCamera);
    stopCameraBtn.addEventListener('click', stopCamera);

    // Event Listener para el botón de alternar el chat
    aiChatToggleBtn.addEventListener('click', toggleChatPanel);
    closeAIPanelBtn.addEventListener('click', toggleChatPanel);

    scanBtn.addEventListener('click', () => {
        if (currentMode === 'static_image') {
            toggleDetections();
        } else if (currentMode === 'realtime_video') {
            if (ws && ws.readyState === WebSocket.OPEN) {
                stopWebSocket();
                showModal('Modo de detección en tiempo real desactivado.');
            } else {
                startWebSocket();
                showModal('Modo de detección en tiempo real activado.');
            }
        } else {
            showModal('Esta función requiere que la cámara esté encendida o que haya una imagen estática cargada.');
        }
    });
    
    boxBtn.addEventListener('click', () => {
        if (currentMode === 'static_image' || currentMode === 'realtime_video') {
            if (detectionOverlay.style.display === 'block' && detectionOverlay.classList.contains('drawing-cursor')) {
                disableManualDrawing();
                showModal('Modo de encajonamiento desactivado.');
            } else {
                enableManualDrawing();
                showModal('Modo de encajonamiento activado. Dibuja un recuadro sobre la imagen.');
            }
        } else {
            showModal('Por favor, inicia la cámara o sube una imagen primero.');
        }
    });

    // PROMPTS ACTUALIZADOS
    promptBtn1.addEventListener('click', () => {
        captureAndAnalyze("Indícame objetos o elementos de importancia clínica visibles en esta imagen.");
    });
    promptBtn2.addEventListener('click', () => {
        captureAndAnalyze("De manera cuantitativa, dame los objetos o células visibles, expresa el conteo de manera numérica, no hay problema si no es exacto, haz una aproximación.");
    });
});