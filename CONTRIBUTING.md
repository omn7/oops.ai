# Contributing to Oops.ai

First off, thank you for considering contributing to **Oops**! It's people like you that make Oops such a great tool. We welcome contributions from anyone, whether it's fixing bugs, improving documentation, or adding major new features.

## How Can I Contribute?

### 1. Reporting Bugs
If you find a bug, please open an issue on GitHub. Include:
- Your operating system and Node.js version.
- Steps to reproduce the bug.
- Expected behavior vs. actual behavior.

### 2. Suggesting Enhancements
Have an idea for a new feature? We'd love to hear it! Open an issue on GitHub and tag it with `enhancement`. Provide as much context as possible about why the feature is useful and how it should work.

### 3. Pull Requests
If you want to contribute code, follow these steps:
1. **Fork the repository** and clone it to your local machine.
2. **Create a new branch** for your feature or bugfix (`git checkout -b feature/your-feature-name`).
3. **Make your changes** and ensure the code works correctly.
4. **Commit your changes** with descriptive commit messages (`git commit -m 'Add some feature'`).
5. **Push to your branch** (`git push origin feature/your-feature-name`).
6. **Open a Pull Request** against the `main` branch.

## Development Setup
To set up the project locally:

```bash
git clone https://github.com/omn7/oops.ai.git
cd oops.ai
npm install
npm link  # This makes the 'oops' command available globally for testing
```

## Code Style
- Keep the code clean, readable, and well-commented.
- If you add a new AI prompt or rule, ensure it is thoroughly tested against false positives.

We look forward to reviewing your contributions!
