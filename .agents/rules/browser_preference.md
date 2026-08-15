---
description: Prefer Brave Browser for launching web applications and local URLs
trigger: always_on
---

# Browser Preference Rule

- **Primary Browser**: Whenever launching the web application, previews, or opening local URLs in a browser, ALWAYS use **Brave Browser** instead of Google Chrome or other browsers.
- **Windows Executable Locations**:
  - `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`
  - `C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe`
- **Launcher Scripts & Commands**:
  - Direct all browser launch scripts or test runs to invoke Brave Browser directly:
    ```cmd
    start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5173/
    ```
