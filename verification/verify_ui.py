from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080/index.html")

            # Wait for board
            page.wait_for_selector("#game-board")

            # Check title
            title = page.title()
            print(f"Page title: {title}")

            # Wait for deck select to be visible (it should be initially)
            page.wait_for_selector("#deck-select")

            # Take screenshot of initial state
            page.screenshot(path="verification/ui_initial.png")

            print("Screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_ui()
