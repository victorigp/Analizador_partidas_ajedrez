# Analizador de Partidas de Ajedrez

Un script automatizado en Python que te permite extraer cualquier partida jugada en **Chess.com**, importarla automáticamente a **Lichess.org** para su análisis con Stockfish, y utilizar la **Inteligencia Artificial de Google Gemini** para generar comentarios detallados y explicaciones didácticas sobre los errores y momentos clave de la partida. Finalmente, agrupa todo en un **Estudio interactivo de Lichess**.

## 🚀 Características

- **Extracción automática:** Obtiene el PGN completo de partidas de Chess.com utilizando Playwright para saltar los popups y modales.
- **Integración con Lichess:** Crea estudios privados, importa los PGNs y gestiona los capítulos automáticamente usando la API REST de Lichess.
- **Análisis Didáctico con IA:** Evalúa la partida anotada mediante Google Gemini, detectando blunders (errores graves) y explicando *por qué* son malos y cuáles eran las mejores alternativas, todo en lenguaje natural.
- **Automatización anti-bots:** Incluye un script de Tampermonkey para solicitar el análisis de servidor de Lichess de manera transparente y segura, imitando a un humano en tu navegador.
- **Gestión de Sesión inteligente:** Extrae automáticamente las cookies necesarias (`lila2`) de tu navegador local (Chrome, Brave, Edge, etc.) para autenticarse en Lichess sin complicaciones.

## 📋 Requisitos Previos

- **Python 3.10 o superior** instalado en tu sistema.
- Una cuenta gratuita en **Lichess.org**.
- Un Token API de Lichess (generado desde las preferencias de tu cuenta).
- Una clave API gratuita de **Google Gemini** (generada desde Google AI Studio).

## 🛠️ Instalación

1. Clona o descarga este repositorio en tu ordenador.
2. Abre una terminal en la carpeta del proyecto e instala las dependencias de Python:
   ```bash
   pip install playwright google-generativeai requests
   ```
3. Instala los navegadores necesarios para Playwright:
   ```bash
   playwright install chromium
   ```
4. **Instalación del script de auto-análisis (Opcional pero recomendado):**
   - Instala la extensión **Tampermonkey** en tu navegador habitual.
   - Crea un nuevo script, copia el contenido del archivo `lichess_auto_analyzer.js` que viene en el proyecto, y guárdalo. Esto permitirá que el análisis de la computadora en Lichess arranque automáticamente al finalizar la exportación.

## ⚙️ Configuración (.env)

El script generará automáticamente un archivo `.env` la primera vez que lo ejecutes si no lo tienes, pidiéndote los datos. Sin embargo, puedes crearlo manualmente en la raíz del proyecto con esta estructura:

```env
LICHESS_TOKEN=tu_token_api_de_lichess_aqui
LICHESS_USERNAME=tu_usuario_o_email
LICHESS_PASSWORD=tu_contraseña
LICHESS_COOKIE=tu_cookie_lila2_aqui (Opcional, el script puede extraerla de tu navegador)
GEMINI_API_KEY=tu_clave_api_de_gemini
GEMINI_MODEL=gemini-pro-latest
```

## 🎮 Uso

La forma más sencilla de utilizar el programa en Windows es a través del archivo por lotes.

1. Haz doble clic en el archivo **`EJECUTAR.bat`**.
2. Pega la URL de la partida de Chess.com que deseas analizar (por ejemplo: `https://www.chess.com/game/computer/123456789`).
3. El script hará todo el trabajo sucio en segundo plano:
   - Extraerá el PGN.
   - Creará el estudio en Lichess.
   - Pedirá a Gemini que comente los errores.
   - Actualizará el PGN con los comentarios en el estudio.
   - Finalmente, se abrirá tu navegador predeterminado para que puedas disfrutar de tu estudio interactivo.

> También puedes ejecutarlo directamente desde la consola:
> ```bash
> python main.py
> # o directamente pasando la URL:
> python main.py https://www.chess.com/game/computer/123456789
> ```

## 📁 Estructura del Proyecto

- `main.py`: Archivo principal que orquesta el flujo completo de ejecución.
- `extraer_pgn.py`: Módulo con Playwright para extraer el texto PGN desde Chess.com.
- `lichess_api.py`: Comunicación con la API REST de Lichess.
- `analisis_ia.py`: Conexión con Google Gemini para generar los comentarios en español.
- `crear_estudio.py`: Lógica para estructurar el estudio en Lichess con los comentarios.
- `login_manual.py`: Utilidad para extraer cookies de sesión de los navegadores locales.
- `lichess_auto_analyzer.js`: Script de Tampermonkey para la automatización en cliente.

## 📜 Licencia

Este proyecto es de código abierto y está disponible bajo los términos de la Licencia MIT.
