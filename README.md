# Interview Coder Free

> Your invisible AI-powered coding interview assistant : capture problems, get solutions, stay discreet.

A free, open-source desktop application designed to help you ace technical coding interviews. Simply screenshot a coding problem, and let AI analyze it and generate optimized solutions with detailed explanations.

---

## ✨ Key Features

### 🖼️ Smart Screenshot Capture
Capture coding problems directly from your screen. Stack up to 2 screenshots to provide more context for complex, multi-part problems.

### 🤖 AI-Powered Problem Solving
Powered by Google Gemini AI with intelligent fallback handling. The app automatically retries with different models if rate limits or network issues occur : so you never get stuck.

### 💬 Conversation Memory
Ask follow-up questions naturally. The AI remembers your entire conversation history until you explicitly reset it, allowing for iterative problem-solving and clarifications.

### 🎤 Voice Input
Speak your questions instead of typing. Perfect for hands-free interaction when you need to stay focused on the interview.

### 🌐 Multi-Language Support
Generate solutions in your preferred programming language : Python, JavaScript, Java, C++, and more.

### 📊 Complexity Analysis
Every solution includes detailed time and space complexity breakdowns to help you understand and explain your approach.

### 👻 Invisible Mode
Toggle the window visibility instantly. The app stays hidden when you need it to, and appears when you need help : completely discreet.

### ⌨️ Fully Keyboard-Driven
Control everything with keyboard shortcuts for maximum speed. No need to click around during high-pressure moments.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | What It Does |
|----------|--------------|
| `Ctrl/Cmd + H` | Take a screenshot |
| `Ctrl/Cmd + Enter` | Process screenshots and get solution |
| `Ctrl/Cmd + R` | Reset conversation and clear history |
| `Ctrl/Cmd + B` | Toggle window visibility (show/hide) |
| `Ctrl/Cmd + Arrow Keys` | Move window around the screen |
| `Ctrl/Cmd + Q` | Quit the application |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** version 16 or higher
- **npm**, **yarn**, or **bun** (any package manager works)
- [**Google Gemini API Key**](#gemini-api-key) (free tier available)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/prabeshAryal/interview-coder-free.git
cd interview-coder-free
```

**2. Install dependencies**

```bash
npm install
# or: yarn install
# or: bun install
```

**3. Run in development mode**

```bash
npm run dev
# or: yarn dev
# or: bun dev
```

**4. Build for production** (optional)

```bash
npm run build
# or: yarn build
# or: bun run build
```

---

<a id="gemini-api-key"></a>

## 🔑 Setting Up Your Google Gemini API Key

The app uses Google Gemini AI for analyzing screenshots and generating solutions. You'll need a free API key to use it.

### Step 1: Get Your API Key 

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy your new API key

### Step 2: Add It to the App

- Open the app and go to **Settings**
- Find the **"API Key"** field
- Paste your Gemini API key and save

That's it! No `.env` files or config editing required.

### Tips & Best Practices

- **Free tier**: Google offers a generous free tier for Gemini API : perfect for personal use
- **Keep it secret**: Never share your API key or commit it to public repositories
- **Monitor usage**: Check your usage in the [Gemini API Usage & Billing](https://aistudio.google.com/usage) if you're concerned about limits

---

## 🎯 How to Use

1. **Start the app** : Run `npm run dev` or launch the built application
2. **Position the window** : Use `Ctrl/Cmd + Arrow Keys` to move it where you want
3. **Take a screenshot** : Press `Ctrl/Cmd + H` to capture a coding problem
4. **Add more context** (optional) : Take another screenshot if the problem spans multiple screens
5. **Get your solution** : Press `Ctrl/Cmd + Enter` to process and receive an AI-generated solution
6. **Ask follow-ups** : Use voice or take more screenshots to ask clarifying questions
7. **Reset when done** : Press `Ctrl/Cmd + R` to clear history and start fresh for the next problem
8. **Stay invisible** : Press `Ctrl/Cmd + B` to hide/show the window as needed

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Electron | Cross-platform desktop app framework |
| React + TypeScript | Modern, type-safe UI |
| Vite | Lightning-fast build tool |
| Tailwind CSS | Utility-first styling |
| Google Gemini AI | Intelligent problem analysis and solution generation |

---

## ⚠️ Disclaimer

This is a free, open-source tool intended for **educational and practice purposes**. Use it responsibly and ethically. The developers are not responsible for how this tool is used.

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve the app.

---
## Overlay focus checks

The overlay stays nonfocusable, including in settings. To change the API key,
copy it first, click **Edit**, **Paste Key from Clipboard**, then **Save Key**.
Keyboard input stays with the foreground application.

Run `npm run test:overlay`, `npx tsc -p tsconfig.electron.json --noEmit`, and
`npx vite build` for automated checks. The regression tests mock Electron;
they do not prove native Windows focus or taskbar behavior.

On Windows, test with an F11 fullscreen browser and an auto-hidden taskbar:

1. Keep a browser text field active and repeatedly press Ctrl+H. Verify captures
   finish and typing continues in the browser without taskbar flashes.
2. Rapidly toggle Ctrl+B while captures run. Verify the final visibility matches
   the last toggle and hidden regions never intercept clicks.
3. Open/close settings rapidly, click language/model controls, paste and save a
   key, and scroll results. Verify the browser remains foreground and settings
   do not reopen or expand after being closed.
4. Repeat on multiple monitors with different scaling, and with capture failing
   or unavailable. A failed capture should report an error and later requests
   should still run; it must not launch a fallback capture program.

Windows screenshots use Electron desktopCapturer, select the primary display by
its display ID, and request its physical pixel dimensions. This avoids starting
an external executable or PowerShell for each capture. See the
[Electron capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer/).
