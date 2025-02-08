# Welcome to P2P Media Loader Contributing Guide

Thank you for investing your time in contributing to our project! We appreciate every pull request, issue report, and suggestion you make to help improve **P2P Media Loader**.

## Table of Contents

- [Using GitHub Codespaces](#using-github-codespaces)
- [Developing Locally](#developing-locally)
- [Contributing Process](#contributing-process)

## Using GitHub Codespaces

The easiest way to contribute is to use **GitHub Codespaces**, which is already preconfigured in this repository.

1. **Fork** the repository (optional if you don’t have write access).
2. **Create a Codespace** from the repository (click the green “Code” button, then choose **Codespaces**).
3. Once the Codespace is ready, open the integrated terminal.
4. Run `pnpm dev` to start the development environment.

That’s it! All required dependencies and tools are pre-installed, so you can begin coding, testing, and debugging right away.

## Developing Locally

If you prefer to develop without Codespaces, follow these steps:

0. **Ensure** you have [pnpm installed](https://pnpm.io/installation) globally if you haven’t already.

1. **Clone** the repository:

   ```bash
   git clone https://github.com/Novage/p2p-media-loader.git
   ```

2. **Install dependencies** for all workspace projects:

   ```bash
   pnpm i
   ```

3. **Start development** mode:
   ```bash
   pnpm dev
   ```

## Contributing Process

1. **Open an issue**: If you find a bug or have a feature request, start by creating a new issue to discuss it.

2. **Fork the repository** (if you don’t have direct commit access).

3. **Create a new branch** for your changes:

   ```bash
   git checkout -b feature/your-feature
   ```

4. Make Your Changes and commit them with a descriptive message.

5. Push Your Branch to GitHub:

   ```bash
   git push origin feature/your-feature
   ```

6. Open a Pull Request: Go to the repository on GitHub, click the “Compare & pull request” button, and fill out the PR template. Describe your changes clearly so reviewers know what you did and why.

We’ll review your pull request, provide feedback if needed, and merge your changes once everything looks good.
