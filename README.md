# Analizador de Partidas de Ajedrez

Un script automatizado en Python que te permite extraer cualquier partida jugada en **Chess.com**, importarla automáticamente a **Lichess.org** para su análisis con Stockfish, y utilizar la **Inteligencia Artificial de Google Gemini** para generar comentarios detallados y explicaciones didácticas sobre los errores y momentos clave de la partida. Finalmente, agrupa todo en un **Estudio interactivo de Lichess**.

## 🚀 Características

- **Extracción automática:** Obtiene el PGN completo de partidas de Chess.com utilizando Playwright.
- **Integración con Lichess:** Crea estudios privados, importa los PGNs y gestiona los capítulos automáticamente usando la API REST de Lichess.
- **Análisis Didáctico con IA:** Evalúa la partida anotada mediante Google Gemini para generar comentarios detallados y explicaciones didácticas en lenguaje natural.
- **Automatización de análisis:** Incluye un script de Tampermonkey para solicitar el análisis de servidor de Lichess.
- **Gestión de Sesión inteligente:** Extrae automáticamente las cookies necesarias (`lila2`) de tu navegador local (Chrome, Brave, Edge, etc.) para autenticarse en Lichess sin complicaciones.

## 📋 Requisitos Previos

- **Python 3.10 o superior** instalado en tu sistema.
- Una cuenta gratuita en **Lichess.org**.
- Un Token API de Lichess (debes crearlo desde las preferencias de tu cuenta de Lichess).
- Una clave API gratuita de **Google Gemini** (debes crearla desde Google AI Studio).

## 🛠️ Instalación

1. Clona o descarga este repositorio en tu ordenador.
2. Abre una terminal en la carpeta del proyecto e instala las dependencias de Python:
   ```bash
   pip install playwright google-generativeai
   ```
3. Instala los navegadores necesarios para Playwright:
   ```bash
   playwright install chromium
   ```
4. **Instalación del script de auto-análisis (Opcional pero recomendado):**
   - Instala la extensión **Tampermonkey** en tu navegador habitual.
   - Crea un nuevo script, copia el contenido del archivo `lichess_auto_analyzer.js` que viene en el proyecto, y guárdalo. Esto permitirá que el análisis de la computadora en Lichess arranque automáticamente al finalizar la exportación.
5. **Instalación del Botón Flotante en Chess.com (Opcional pero recomendado):**
   - El proyecto incluye una carpeta llamada `Boton flotante` que te permite integrar el analizador directamente en la interfaz de Chess.com.
   - Haz clic derecho en `Boton flotante/registrar_protocolo.bat` y selecciona **Ejecutar como administrador**. Esto enseñará a Windows a abrir tu analizador cuando detecte el protocolo `ajedrez://`.
   - Importa en **Tampermonkey** el script de `Boton flotante/chess_button_analyzer.js`.
   - A partir de ahora, cuando estés en una partida de Chess.com, aparecerá un botón verde flotante de "🤖 Analizar con IA" que lanzará el script en segundo plano automáticamente.

## ⚙️ Configuración (.env)

El script generará automáticamente un archivo `.env` la primera vez que lo ejecutes si no lo tienes, pidiéndote los datos. Sin embargo, puedes crearlo manualmente en la raíz del proyecto con esta estructura:

```env
CHESSCOM_PLAYER=tu_usuario_en_chess.com
LICHESS_TOKEN=tu_token_api_de_lichess_aqui
LICHESS_USERNAME=tu_usuario_o_email
LICHESS_PASSWORD=tu_contraseña
LICHESS_COOKIE=tu_cookie_lila2_aqui (Opcional, el script puede extraerla de tu navegador)
GEMINI_API_KEY=tu_clave_api_de_gemini
GEMINI_API_KEY_1=tu_clave_api_alternativa_1 (Opcional, se usará si la principal agota su cuota)
GEMINI_API_KEY_2=tu_clave_api_alternativa_2 (Opcional, puedes añadir más API KEY si lo deseas)
GEMINI_MODEL=gemini-3.1-pro-preview
```

## 🎮 Uso

La forma más sencilla e integrada de utilizar el programa es a través del botón flotante en la propia web de Chess.com (ver instrucciones de instalación arriba). Una vez instalado, solo tienes que hacer clic en el botón verde "🤖 Analizar con IA" al terminar una partida.

Si no deseas instalar el botón flotante, puedes usar el archivo por lotes en Windows:

**Método rápido con script (Auto-detección):**
1. Copia la URL de la partida de Chess.com en tu navegador (`Ctrl + C`).
2. Haz doble clic en el archivo **`EJECUTAR.bat`**.
3. El programa detectará la URL en tu portapapeles automáticamente y te preguntará si deseas analizarla.

**Método manual:**
1. Haz doble clic en el archivo **`EJECUTAR.bat`**.
2. Pega la URL de la partida de Chess.com que deseas analizar (por ejemplo: `https://www.chess.com/game/computer/123456789`).

Una vez introducida la URL, el script hará todo el trabajo sucio en segundo plano:
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
- `browser_utils.py`: Utilidad para inicializar el navegador Playwright correcto.
- `login_manual.py`: Utilidad para extraer cookies de sesión de los navegadores locales.
- `EJECUTAR.bat`: Script de Windows para lanzar el programa rápidamente.
- `lichess_auto_analyzer.js`: Script de Tampermonkey para la automatización en cliente.
- `Boton flotante/`: Directorio con los scripts necesarios para integrar el botón en la web de Chess.com.

## 📜 Licencia

Este proyecto es de código abierto y está disponible bajo los términos de la Licencia MIT.
