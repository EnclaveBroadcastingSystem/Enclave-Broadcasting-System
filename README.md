Enclave Radio is a Fallout-inspired radio terminal simulation built with HTML, CSS, and JavaScript, designed to replicate the look and behavior of an in-universe radio broadcast system.
The project features a retro terminal UI, channel routing, audio playback, ticker messages, and theming support. It was originally built as a web application and is now being adapted into a fully offline Android APK using a WebView-based wrapper while preserving the original layout, styles, and behavior.

✨️Features
Fallout-style terminal interface
Multiple radio channels (music, broadcasts, emergency audio, etc.)
Audio playback with user-interaction “Connect” gate (mobile-safe autoplay handling)
JSON-driven channel configuration
Theme support via CSS
Designed to run offline with bundled audio files
No framework dependency (vanilla HTML/CSS/JS)

🎯 Project Goals
Convert the existing web app into an Android APK
Retain 100% of the original UI/UX
Bundle audio locally (no streaming or backend server)
Support Android audio playback reliably via WebView
Keep the codebase simple and moddable

🛠️ Tech Stack
HTML5 / CSS3
Vanilla JavaScript
JSON configuration files
Android WebView wrapper (Capacitor / Cordova)

🚧 Current Status
Web version fully functional
Android APK conversion in progress
Seeking guidance and contributions related to:
Android WebView audio behavior
APK packaging best practices
Background audio handling
