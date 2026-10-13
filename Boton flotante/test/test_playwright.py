import os
import sys
from playwright.sync_api import sync_playwright

# Añadir directorio raíz al path para importar browser_utils
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from browser_utils import iniciar_navegador

def test_chesscom_and_lichess():
    script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'chess_button_analyzer.js'))
    with open(script_path, 'r', encoding='utf-8') as f:
        userscript_content = f.read()

    print(f"Probando script compilado ({len(userscript_content)} bytes)...")

    with sync_playwright() as p:
        browser = iniciar_navegador(p, headless=True)
        page = browser.new_page()

        errors = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        # 1. Prueba en Chess.com (simulando contexto de partida)
        print("1. Probando en entorno Chess.com...")
        page.goto("https://www.chess.com/robots.txt") # Pagina ligera en dominio chess.com
        # Modificar URL y DOM con History API y mock DOM
        page.evaluate("""() => {
            window.history.pushState({}, 'Game', '/game/live/123456789');
            document.body.innerHTML = `
                <div class="board-layout-top"><span data-test-element="user-tagline-username">PlayerWhite</span></div>
                <div class="board-layout-bottom"><span data-test-element="user-tagline-username">PlayerBlack</span></div>
            `;
        }""")

        # Inyectar Userscript
        page.evaluate(userscript_content)

        # Verificar botón flotante
        btn = page.query_selector("button:has-text('🤖 Analizar con IA')")
        assert btn is not None, "El botón '🤖 Analizar con IA' no se inyectó en Chess.com"
        print("[OK] Boton 'Analizar con IA' detectado en el DOM")

        # Hacer clic en el botón para abrir el modal
        btn.click()
        page.wait_for_timeout(300)

        modal = page.query_selector("#agy-analysis-modal")
        assert modal is not None, "El modal #agy-analysis-modal no se abrió al pulsar el botón"
        print("[OK] Modal #agy-analysis-modal abierto correctamente")

        # Verificar elementos del modal
        target_select = page.query_selector("#modal-target")
        assert target_select is not None, "#modal-target no encontrado"

        depth_slider = page.query_selector("#modal-depth")
        assert depth_slider is not None, "#modal-depth no encontrado"

        start_btn = page.query_selector("#modal-start")
        assert start_btn is not None, "#modal-start no encontrado"

        gear_btn = page.query_selector("#modal-gear")
        assert gear_btn is not None, "#modal-gear no encontrado"
        print("[OK] Elementos de vista principal del modal verificados")

        # Probar transición a la vista de configuración
        gear_btn.click(force=True)
        page.wait_for_timeout(400)

        threads_input = page.query_selector("#modal-threads")
        assert threads_input is not None, "#modal-threads no encontrado en configuración"

        save_btn = page.query_selector("#modal-save")
        assert save_btn is not None, "#modal-save no encontrado en configuración"
        print("[OK] Vista de configuración del modal verificada")

        # 2. Prueba en Lichess (simulando estudio)
        print("2. Probando en entorno Lichess Study...")
        page.goto("https://lichess.org/robots.txt")
        page.evaluate("""() => {
            window.history.pushState({}, 'Study', '/study/teststudy123');
            document.body.innerHTML = `
                <div class="study__message"></div>
                <div class="analyse__moves"></div>
                <cg-board></cg-board>
            `;
        }""")

        page.evaluate(userscript_content)
        page.wait_for_timeout(300)

        styles = page.query_selector("#local-analysis-styles")
        assert styles is not None, "Los estilos #local-analysis-styles no se inyectaron en Lichess"
        print("[OK] Estilos #local-analysis-styles inyectados correctamente en Lichess")

        browser.close()

        if errors:
            print("Errores JS detectados:", errors)
            raise AssertionError(f"Se detectaron errores en la consola: {errors}")

        print("=== Todas las pruebas de navegador con Playwright pasaron con exito ===")

if __name__ == "__main__":
    test_chesscom_and_lichess()
