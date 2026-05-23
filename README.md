# Oops - AI Code Review Assistant 🚨

Never accidentally push bad code, exposed secrets, or vulnerable scripts again. **Oops** is an intelligent CLI tool that intercepts your Git commits via a pre-commit hook and uses AI (Google Gemini or a local Ollama model) to perform a deep logical security review of your code before it reaches your repository.

---

## Features

- **Fast Local Scan:** Instantly catches `.env` files, AWS keys, JWTs, and common secrets using Regex before the AI is even invoked.
- **AI-Powered Code Review:** Sends staged diffs to Google Gemini or a local LLM for context-aware logical security reviews.
- **Interactive Fix Generation:** If an issue is found, Oops can automatically generate a fix and save it to a local text file for you to apply effortlessly.
- **Cross-Platform:** Works on Windows, macOS, and Linux.
- **Easy Integration:** Seamlessly integrates with Husky.

---

## 🚀 1-Click Installation

You can install `oops` globally on your system using our automated installation scripts.

### Windows (PowerShell)
```powershell
iex (irm https://raw.githubusercontent.com/omn7/oops.ai/main/scripts/install.ps1)
```

### macOS / Linux (Bash)
```bash
curl -fsSL https://raw.githubusercontent.com/omn7/oops.ai/main/scripts/install.sh | bash
```

*Alternatively, you can install it manually by cloning the repo and running `npm install -g .`*

---

## ⚙️ Initial Configuration

Once installed, simply run the interactive setup menu from anywhere in your terminal:

```bash
oops start
```

This interactive menu allows you to:
1. **Setup Local LLM:** Connect to your local Ollama instance.
2. **Setup AI API Key:** Securely enter and save your Gemini API Key.
3. **Run Manual Review:** Immediately review any staged files in your current repository.

*Your configuration is stored securely in `~/.oops_config.json`.*

---

## 🔗 Adding Oops to Your Projects

To protect an existing project, simply navigate to that project's folder and integrate Oops with Husky:

```bash
# 1. Initialize Husky
npx husky init

# 2. Add Oops to your pre-commit hook (ensure TTY for interactivity)
echo -e "exec < /dev/tty\noops --pre-commit" > .husky/pre-commit
```
*(Note on Windows: Use `echo "exec < /dev/tty` followed by a new line with `oops --pre-commit" > .husky/pre-commit` if your shell doesn't support `-e`)*

Now, whenever you run `git commit`, Oops will automatically intercept and scan your staged files!

---

## 🛠️ Automated Fixes

If Oops detects a vulnerability, it will block the commit and ask:
> **? Issues were found. What would you like to do?**

If you choose to **Generate a fix**, Oops will output the exact code changes needed directly into an `oops-fix.txt` file in your directory.

---

*Built with Node.js, @inquirer/prompts, and AI.*
