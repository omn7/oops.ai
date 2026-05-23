#!/bin/bash

# Oops CLI Installation Script for macOS/Linux

echo -e "\033[0;36mInstalling Oops AI Code Review Assistant...\033[0m"

# Check for Git
if ! command -v git &> /dev/null; then
    echo -e "\033[0;31mError: Git is required but not installed. Please install Git and try again.\033[0m"
    exit 1
fi

# Check for Node.js
if ! command -v npm &> /dev/null; then
    echo -e "\033[0;31mError: Node.js/npm is required but not installed. Please install Node.js and try again.\033[0m"
    exit 1
fi

INSTALL_DIR="$HOME/.oops-cli"

# Remove existing installation if present
if [ -d "$INSTALL_DIR" ]; then
    echo -e "\033[0;33mRemoving previous installation...\033[0m"
    rm -rf "$INSTALL_DIR"
fi

echo -e "\033[0;36mCloning Oops repository...\033[0m"
git clone -q https://github.com/omn7/oops.ai.git "$INSTALL_DIR"

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "\033[0;31mError: Failed to clone repository.\033[0m"
    exit 1
fi

cd "$INSTALL_DIR" || exit

echo -e "\033[0;36mInstalling dependencies...\033[0m"
npm install --silent

echo -e "\033[0;36mLinking Oops globally...\033[0m"
# Use sudo for npm link if needed on Linux/macOS
if [ "$EUID" -ne 0 ] && command -v sudo &> /dev/null; then
    sudo npm link
else
    npm link
fi

echo -e "\n\033[0;32m===================================================\033[0m"
echo -e "\033[0;32m ✓ Oops CLI installed successfully!                \033[0m"
echo -e "\033[0;32m===================================================\033[0m\n"
echo -e "\033[1;37mTo configure your AI and get started, run:\033[0m"
echo -e "    \033[0;36moops start\033[0m\n"
