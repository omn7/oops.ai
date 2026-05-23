# Oops - AI Code Review & DevSecOps CLI 🚨

<p align="center">
  <img src="logo.png" alt="Oops.ai Logo" width="500">
</p>


[![NPM Version](https://img.shields.io/npm/v/oops-sec-cli.svg)](https://www.npmjs.com/package/oops-sec-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Never accidentally push bad code, exposed secrets, or vulnerable scripts again. **Oops** is an intelligent CLI DevSecOps agent that intercepts your Git commits, scans your entire project, and automatically fixes vulnerabilities using AI (OpenAI, Anthropic, Gemini, or local Ollama models) before your code reaches production.

🌐 **Website:** [oopsai.vercel.app](https://oopsai.vercel.app/)  
📦 **NPM Package:** [npmjs.com/package/oops-sec-cli](https://www.npmjs.com/package/oops-sec-cli?activeTab=dependencies)

---

## 🌟 Core Features

- **✨ Auto-Heal Workflow:** Oops doesn't just tell you what's wrong. If it finds a vulnerability, it will parse the AI's JSON response and literally rewrite and fix the code inside your local files automatically.
- **🧠 Smart Framework Detection:** The offline Deep Scanner dynamically analyzes your project structure. It automatically loads custom security rules if it detects React, Next.js (`NEXT_PUBLIC_` secret leaks), or Python Django projects.
- **☁️ Enterprise CI/CD Pipeline Generator:** One click transforms Oops from a local CLI into an Enterprise DevSecOps tool. Run `oops setup-ci` to instantly generate a GitHub Actions workflow that blocks vulnerable Pull Requests across your entire team.

---

## 🚀 Installation & Usage

You can install `oops` globally on your system using NPM:

```bash
npm install -g oops-sec-cli
```

### ⚙️ Interactive Menu
Once installed, simply run the interactive setup menu from anywhere in your terminal:

```bash
oops start
```

This interactive menu allows you to:
1. **Setup Cloud AI API:** Enter your OpenAI, Anthropic, or Gemini API Key.
2. **Setup Local LLM:** Connect to your local Ollama instance for 100% private, offline code reviews.
3. **Run Full Project Scan:** Scan your entire directory for vulnerabilities and let the AI **Auto-Heal** your code.
4. **Generate CI/CD Pipeline:** Automatically write a `.github/workflows/oops-security.yml` file to protect your repository on GitHub.

---

## 🔗 Protecting Commits (Pre-Commit Hook)

To protect an existing project, navigate to your folder and integrate Oops with Husky:

```bash
# 1. Initialize Husky
npx husky init

# 2. Add Oops to your pre-commit hook (ensure TTY for interactivity)
echo -e "exec < /dev/tty\noops --pre-commit" > .husky/pre-commit
```
*(Note on Windows: Use `echo "exec < /dev/tty` followed by a new line with `oops --pre-commit" > .husky/pre-commit` if your shell doesn't support `-e`)*

Now, whenever you run `git commit`, Oops will automatically intercept and scan your staged files! If a secret or vulnerability is found, it blocks the commit and gives you the option to let the AI fix it.

---

## 🤝 Contributing
Contributions are always welcome! Please read our [Contributing Guide](CONTRIBUTING.md) to learn how you can help improve Oops.

---

*Built by @omn7 and @jayeshmahajan0*
