<p align="center">
  <a href="https://github.com/user-attachments/assets/5b4ad33c-d6a2-469b-8f87-285e55296373">
    <img height="320" alt="analisis_ia" src="https://github.com/user-attachments/assets/5b4ad33c-d6a2-469b-8f87-285e55296373" />
  </a>
  &ensp;
  <a href="https://github.com/user-attachments/assets/8fb0e964-1381-4e99-b454-b7227cf5a7d5">
    <img height="320" alt="7_partida1" src="https://github.com/user-attachments/assets/8fb0e964-1381-4e99-b454-b7227cf5a7d5" />
  </a>
  &ensp;
  <a href="https://github.com/user-attachments/assets/c42b5b2f-2812-4793-af31-1011924be449">
    <img height="320" alt="8_partida2" src="https://github.com/user-attachments/assets/c42b5b2f-2812-4793-af31-1011924be449" />
  </a>
</p>

# Analizador de Partidas de Ajedrez

Un script automatizado en Python que te permite extraer cualquier partida jugada en **Chess.com**, evaluarla localmente con **Stockfish**, y utilizar la **Inteligencia Artificial de Google Gemini** para generar comentarios detallados y explicaciones didácticas sobre los errores y momentos clave de la partida. Finalmente, agrupa todo en un **Estudio interactivo de Lichess**.

## 🚀 Características

- **Extracción automática:** Obtiene el PGN completo de partidas de Chess.com mediante endpoints HTTP y decodificación TCN.
- **Análisis Local Preciso:** Evalúa cada jugada con el motor Stockfish local para clasificar los movimientos (Brillante, Error, etc.).
- **Integración con Lichess:** Crea estudios privados y gestiona los capítulos automáticamente usando la API REST de Lichess.
- **Análisis Didáctico con IA:** Evalúa la partida anotada mediante Google Gemini para generar comentarios detallados y explicaciones didácticas en lenguaje natural.
- **Automatización y Consola Web:** Incluye scripts para inyectar botones en Chess.com, seguir los logs de progreso en vivo dentro del propio navegador mediante un servicio HTTP local en `127.0.0.1:8765` (puerto configurable) y visualizar métricas.
- **Gestión de Sesión inteligente:** Extrae automáticamente las cookies necesarias (`lila2`) de tu navegador local (Chrome, Brave, Edge, etc.) para autenticarse en Lichess sin complicaciones.

## 📋 Requisitos Previos

- **Python 3.10 o superior** instalado en tu sistema.
- **Binario de Stockfish:** Motor de ajedrez para el análisis local. Puedes descargarlo directamente desde la [página oficial de Stockfish](https://stockfishchess.org/download/windows) (o usar el ejecutable incluido en la carpeta `stockfish/`). Colócalo en la carpeta `stockfish/` como `stockfish-windows-x86-64-universal.exe` o ajusta la variable `STOCKFISH_PATH` en tu `.env`.
- Una cuenta gratuita en **Lichess.org**.
- Un Token API de Lichess con permiso `study:write` (creado en [preferencias de Lichess / Tokens API](https://lichess.org/account/oauth/token)).
- Una clave API gratuita de **Google Gemini** (debes crearla desde Google AI Studio).

## 🛠️ Instalación

1. Clona o descarga este repositorio en tu ordenador.
2. Abre una terminal en la carpeta del proyecto e instala las dependencias de Python:
   ```bash
   pip install -r requirements.txt
   ```
   *(Opcional: Si no deseas instalar el script de Tampermonkey y deseas ejecutar manualmente el programa, el asistente por consola puede extraer automáticamente la sesión de Lichess de tu navegador habitual, pero necesitas instalar también `pip install playwright`)*.
3. **Instalación del script de Tampermonkey (Opcional pero recomendado):**
   - Instala la extensión **Tampermonkey** en tu navegador habitual.
   - **Instalación rápida en 1 clic:** Abre este enlace directo para que Tampermonkey lo detecte e instale automáticamente:  
     👉 [**Instalar / Actualizar Script en Tampermonkey**](https://raw.githubusercontent.com/victorigp/Analizador_partidas_ajedrez/master/Boton%20flotante/dist/chess_button_analyzer.js)  
     *(O si prefieres manual: importa el archivo `Boton flotante/dist/chess_button_analyzer.js` en el panel de Tampermonkey y guarda con `Ctrl + S`)*.
   - Haz clic derecho en `Boton flotante/registrar_protocolo.bat` y selecciona **Ejecutar como administrador**. Esto asocia el protocolo `ajedrez://` directamente a `pythonw.exe` para ejecutar el analizador y Stockfish de forma 100% silenciosa en segundo plano (sin parpadeos ni ventanas de consola en Windows).
   - **Avisos y permisos esperados la primera vez:**
     - *Permisos de red en Tampermonkey:* Al guardar o ejecutar el script, Tampermonkey solicitará confirmación para conectarse a `127.0.0.1` (`@connect`). Elige **"Permitir siempre"** para autorizar la lectura de los logs locales.
     - *Modo Desarrollador (Chrome, Brave, Edge):* En navegadores Chromium, Tampermonkey puede solicitar activar el interruptor de "Modo de desarrollador" en la gestión de extensiones (`chrome://extensions`) para autorizar scripts de usuario.
     - *Diálogo del navegador al abrir la aplicación:* La primera vez que pulses **INICIAR** en Chess.com, el navegador mostrará una ventana emergente (*"¿Deseas abrir Analizador de partidas?"* o *"chess.com quiere abrir ajedrez://"*). Marca la casilla **"Permitir siempre a chess.com abrir estos enlaces"** y haz clic en **Abrir enlace** o **Permitir**.
     - *Comunicación local:* El backend inicia un servidor temporal en `127.0.0.1:8765` (configurable desde los ajustes de la modal o `.env`) restringido a la propia máquina para emitir los logs hacia la interfaz. Al estar confinado a loopback, no expone datos a la red ni genera alertas del Firewall de Windows.
   - **Funciones del script:**
     - En Chess.com añade el botón verde "🤖 Analizar con IA" junto a un modal con consola integrada para configurar opciones (profundidad, puerto, modelo de IA) y seguir el progreso en tiempo real.
     - En el estudio final de Lichess muestra el gráfico SVG local, las anotaciones de la IA y la clasificación detallada de las jugadas (Brillante, Genial, Mejor, etc.) sin depender del motor de Lichess.

## ⚙️ Configuración (.env)

El script generará automáticamente un archivo `.env` la primera vez que lo ejecutes si no lo tienes, pidiéndote los datos. Sin embargo, puedes crearlo manualmente en la raíz del proyecto con esta estructura:

```env
CHESSCOM_PLAYER=tu_usuario_en_chess.com
LICHESS_TOKEN=tu_token_api_de_lichess_aqui
LICHESS_COOKIE=tu_cookie_lila2_aqui (Opcional, el script puede extraerla de tu navegador)
GEMINI_API_KEY=tu_clave_api_de_gemini
GEMINI_API_KEY_1=tu_clave_api_alternativa_1 (Opcional, se usará si la principal agota su cuota)
GEMINI_API_KEY_2=tu_clave_api_alternativa_2 (Opcional, puedes añadir más API KEY si lo deseas)
GEMINI_MODEL=el_modelo_a_usar (ej: gemini-3.5-flash, gemini-flash-lite-latest, etc.)
SERVER_PORT=8765 (Opcional, puerto HTTP local para la comunicación web, por defecto 8765)
STOCKFISH_PATH=stockfish/stockfish-windows-x86-64-universal.exe (Opcional, busca por defecto en la subcarpeta stockfish)
STOCKFISH_THREADS=1 (Opcional, hilos de CPU; se recomienda 1 para garantizar un análisis determinista y reproducible)
STOCKFISH_HASH=512 (Opcional, memoria RAM en MB asignada a Stockfish, por defecto 512)
STOCKFISH_DEPTH=18 (Opcional, profundidad de análisis; a mayor profundidad mayor tiempo de cálculo exponencial, 14 a 18 es el rango óptimo)
POLYGLOT_BOOK_PATH=stockfish/polyglot.bin (Opcional, busca por defecto en la subcarpeta stockfish)
OPENING_EXPLORER_ENABLED=true (Opcional, consulta el explorador de aperturas de Lichess para libros teóricos)
```

> **Nota:** Todos estos valores también se pueden configurar y guardar directamente desde el icono de engranaje (⚙️) del modal en Chess.com, el cual sincroniza y actualiza automáticamente el archivo `.env`.

## 🎮 Uso

La forma más sencilla e integrada de utilizar el programa es a través del botón flotante en la propia web de Chess.com:
1. Haz clic en el botón verde **"🤖 Analizar con IA"** en una partida terminada.
2. Pulsa en **INICIAR**. El análisis arrancará de forma completamente silenciosa en segundo plano (vía `pythonw.exe`) y podrás seguir el progreso en directo en el propio modal.
3. Puedes cancelar el proceso en cualquier momento pulsando el aspa (**✖**) del modal, lo cual cerrará inmediatamente la tarea de Python y el servidor local.

Si prefieres ejecutarlo manualmente con consola visible, puedes usar el archivo por lotes en Windows:

**Método rápido con script (Auto-detección):**
1. Copia la URL de la partida de Chess.com en tu navegador (`Ctrl + C`).
2. Haz doble clic en el archivo **`EJECUTAR.bat`**.
3. El programa detectará la URL en tu portapapeles automáticamente y te preguntará si deseas analizarla.

**Método manual:**
1. Haz doble clic en el archivo **`EJECUTAR.bat`**.
2. Pega la URL de la partida de Chess.com que deseas analizar (por ejemplo: `https://www.chess.com/game/computer/123456789`).

Una vez introducida la URL, el script realiza el flujo completo:
- Extrae el PGN de Chess.com.
- Analiza y clasifica localmente las jugadas con Stockfish.
- Genera explicaciones y comentarios didácticos con Google Gemini conservando los metadatos.
- Crea el estudio en Lichess con el PGN anotado (sin requerir análisis del servidor de Lichess).
- Abre automáticamente tu navegador predeterminado con el estudio interactivo y la interfaz enriquecida.

> También puedes ejecutarlo directamente desde la consola:
> ```bash
> python main.py
> # o directamente pasando la URL:
> python main.py https://www.chess.com/game/computer/123456789
> ```
>
> **Nota sobre la sesión de Lichess en modo manual:**  
> Si no tienes configurada la cookie `LICHESS_COOKIE` en tu `.env`, la primera vez el asistente de consola te preguntará si deseas extraerla automáticamente de tu navegador local (requiere `pip install playwright`). Si no tienes Playwright instalado o prefieres no usarlo, puedes pulsar `N` y pegar la cookie manualmente.

## 📁 Estructura del Proyecto

- `main.py`: Archivo principal que orquesta el flujo completo de ejecución.
- `requirements.txt`: Lista de dependencias requeridas para Python.
- `extraer_pgn.py`: Módulo para extraer el texto PGN desde Chess.com (vía endpoint HTTP y decodificación TCN).
- `analisis_ia.py`: Conexión con Google Gemini para generar los comentarios en español.
- `local_analysis.py`: Ejecuta Stockfish localmente para evaluar cada posición y jugada.
- `advanced_classification.py`: Algoritmo de clasificación de jugadas (Brillante, Gran jugada, Mejor, Error, Imprecisión, etc.) basado en Expected Points.
- `crear_estudio.py`: Lógica para estructurar el estudio en Lichess con los comentarios.
- `browser_utils.py`: Utilidad para inicializar el navegador Playwright correcto.
- `login_manual.py`: Utilidad para extraer cookies de sesión de los navegadores locales.
- `EJECUTAR.bat`: Script de Windows para lanzar el programa rápidamente desde consola.
- `Boton flotante/`: Directorio con el script para Tampermonkey y el protocolo de Windows:
  - `dist/chess_button_analyzer.js`: Script compilado y listo para instalar en Tampermonkey.
  - `registrar_protocolo.bat`: Script para asociar el protocolo `ajedrez://` en Windows.
  - `src/`: Código fuente modular (solo para desarrolladores que deseen modificar el Userscript).

## 📜 Licencia

- El código fuente de este proyecto se distribuye bajo los términos de la **Licencia MIT**.
- **Stockfish** es un proyecto independiente desarrollado por la comunidad de Stockfish y licenciado bajo la **GNU General Public License v3 (GPL v3)**. Consulta los detalles en el [repositorio de Stockfish](https://github.com/official-stockfish/Stockfish).
