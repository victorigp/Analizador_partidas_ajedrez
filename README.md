# Analizador de Partidas de Ajedrez

Un script automatizado en Python que te permite extraer cualquier partida jugada en **Chess.com**, evaluarla localmente con **Stockfish**, y utilizar la **Inteligencia Artificial de Google Gemini** para generar comentarios detallados y explicaciones didácticas sobre los errores y momentos clave de la partida. Finalmente, agrupa todo en un **Estudio interactivo de Lichess**.

## 🚀 Características

- **Extracción automática:** Obtiene el PGN completo de partidas de Chess.com utilizando Playwright.
- **Análisis Local Preciso:** Evalúa cada jugada con el motor Stockfish local para clasificar los movimientos (Brillante, Error, etc.).
- **Integración con Lichess:** Crea estudios privados y gestiona los capítulos automáticamente usando la API REST de Lichess.
- **Análisis Didáctico con IA:** Evalúa la partida anotada mediante Google Gemini para generar comentarios detallados y explicaciones didácticas en lenguaje natural.
- **Automatización UI:** Incluye scripts para inyectar botones en Chess.com y visualizar métricas.
- **Gestión de Sesión inteligente:** Extrae automáticamente las cookies necesarias (`lila2`) de tu navegador local (Chrome, Brave, Edge, etc.) para autenticarse en Lichess sin complicaciones.

## 📋 Requisitos Previos

- **Python 3.10 o superior** instalado en tu sistema.
- **Binario de Stockfish** (ejecutable de Windows) para el análisis local. Incluido en el repositorio en la carpeta `stockfish`.
- Una cuenta gratuita en **Lichess.org**.
- Un Token API de Lichess (debes crearlo desde las preferencias de tu cuenta de Lichess).
- Una clave API gratuita de **Google Gemini** (debes crearla desde Google AI Studio).

## 🛠️ Instalación

1. Clona o descarga este repositorio en tu ordenador.
2. Abre una terminal en la carpeta del proyecto e instala las dependencias de Python:
   ```bash
   pip install playwright google-generativeai chess
   ```
3. Instala los navegadores necesarios para Playwright:
   ```bash
   playwright install chromium
   ```
4. **Instalación del script de Tampermonkey (Opcional pero recomendado):**
   - Instala la extensión **Tampermonkey** en tu navegador habitual.
   - Importa `Boton flotante/chess_button_analyzer.js`.
   - Este script tiene dos funciones:
      - En Chess.com añade el botón verde "🤖 Analizar con IA". 
      - En el estudio final de Lichess muestra el gráfico de la partida, las anotaciones hechas por la IA y la clasificación de las jugadas parecidas a chess.com
   - Haz clic derecho en `Boton flotante/registrar_protocolo.bat` y selecciona **Ejecutar como administrador**. Esto enseñará a Windows a abrir el analizador cuando detecte el protocolo `ajedrez://`.

## ⚙️ Configuración (.env)

El script generará automáticamente un archivo `.env` la primera vez que lo ejecutes si no lo tienes, pidiéndote los datos. Sin embargo, puedes crearlo manualmente en la raíz del proyecto con esta estructura:

```env
CHESSCOM_PLAYER=tu_usuario_en_chess.com
LICHESS_TOKEN=tu_token_api_de_lichess_aqui
LICHESS_COOKIE=tu_cookie_lila2_aqui (Opcional, el script puede extraerla de tu navegador)
GEMINI_API_KEY=tu_clave_api_de_gemini
GEMINI_API_KEY_1=tu_clave_api_alternativa_1 (Opcional, se usará si la principal agota su cuota)
GEMINI_API_KEY_2=tu_clave_api_alternativa_2 (Opcional, puedes añadir más API KEY si lo deseas)
GEMINI_MODEL=el_modelo_a_usar (ej: gemini-3.5-flash, gemini-3.1-pro-preview, etc.)
STOCKFISH_PATH=stockfish/stockfish-windows-x86-64-universal.exe (Opcional, busca por defecto en la subcarpeta stockfish)
STOCKFISH_THREADS=2 (Opcional, hilos de CPU asignados a Stockfish)
STOCKFISH_HASH=128 (Opcional, memoria RAM en MB asignada a Stockfish)
STOCKFISH_DEPTH=20 (Opcional, profundidad de análisis, por defecto 20)
POLYGLOT_BOOK_PATH=stockfish/polyglot.bin (Opcional, busca por defecto en la subcarpeta stockfish)
```

## 🎮 Uso

La forma más sencilla e integrada de utilizar el programa es a través del botón flotante en la propia web de Chess.com (ver instrucciones de instalación arriba). Una vez instalado, solo tienes que hacer clic en el botón verde "🤖 Analizar con IA" en una partida.

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
- `local_analysis.py`: Ejecuta Stockfish localmente para evaluar y clasificar cada jugada.
- `crear_estudio.py`: Lógica para estructurar el estudio en Lichess con los comentarios.
- `browser_utils.py`: Utilidad para inicializar el navegador Playwright correcto.
- `login_manual.py`: Utilidad para extraer cookies de sesión de los navegadores locales.
- `EJECUTAR.bat`: Script de Windows para lanzar el programa rápidamente.
- `Boton flotante/`: Directorio con los scripts de Tampermonkey y el protocolo de apertura para integrar Chess.com y Lichess.

## 📜 Licencia

Este proyecto es de código abierto y está disponible bajo los términos de la Licencia MIT.
