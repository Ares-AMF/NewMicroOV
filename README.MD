Guía de Configuración y Ejecución de MicroOV
Esta guía te ayudará a preparar el entorno virtual e iniciar la aplicación MicroV. Asegúrate de tener Python 3.8 o superior instalado en tu sistema.

1. Preparación del Entorno Virtual
Primero, crea el entorno virtual en la carpeta de tu proyecto.

python -m venv venv_newmicroov

2. Activación del Entorno
Una vez creado, activa el entorno virtual.

En Windows:

.\venv_newmicroov\Scripts\activate

Después de ejecutar el comando, deberías ver (venv_newmicroov) al inicio de la línea de comandos.

3. Instalación de Dependencias
Antes de continuar, asegúrate de que el archivo requirements.txt contiene todas las bibliotecas necesarias. Luego, instala todas las dependencias con el siguiente comando:

pip install -r requirements.txt

4. Ejecutar la Aplicación
Finalmente, inicia el servidor de la aplicación con Uvicorn.

uvicorn main:app --host 127.0.0.1 --port 8000
