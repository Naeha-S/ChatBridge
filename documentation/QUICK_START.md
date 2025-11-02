# Quick Start Guide

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Naeha-S/ChatBridge.git
   cd ChatBridge
   ```

2. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `ChatBridge` folder
   - Pin the ⚡ icon to your toolbar

3. **Configure API Key (Optional)**
   - Right-click extension icon → **Options**
   - Get a free Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Paste and save

## Basic Usage

### 1. Scan a Conversation
- Navigate to any supported AI platform (ChatGPT, Claude, Gemini, etc.)
- Click the ⚡ floating avatar (bottom right)
- Click **"Scan Chat"**
- Your conversation is captured and saved locally

### 2. Transform Content
After scanning, use any tool:
- **Summarize**: Multiple lengths and formats (paragraph, bullets, executive, technical)
- **Rewrite**: Styles (concise, direct, detailed, academic)
- **Translate**: 20+ languages
- **Sync Tone**: Optimize prompts for target AI model

### 3. Continue on Another Platform
- After transformation, click **"Insert to Chat"**
- Select target platform (ChatGPT, Claude, Gemini, etc.)
- Text automatically opens in new tab and pastes into chat

### 4. View Saved Conversations
- Click ⚡ → **"History"**
- Browse, search, or restore any saved conversation
- Export/import for backup

## Keyboard Shortcuts

- **Ctrl+Shift+S** (Cmd+Shift+S on Mac): Quick scan
- **Ctrl+Shift+H** (Cmd+Shift+H on Mac): Toggle sidebar
- **Ctrl+Shift+I** (Cmd+Shift+I on Mac): Insert to chat

## Supported Platforms

✅ ChatGPT | Claude | Gemini | Copilot | Perplexity  
✅ Poe | Grok (X.AI) | DeepSeek | Mistral | Meta AI

## Troubleshooting

**Extension not visible?**
- Ensure Developer mode is enabled
- Check that you're on a supported site
- Reload the extension

**Empty scan?**
- Wait for page to fully load
- Scroll to see all messages
- Check browser console (F12) for errors

**API not working?**
- Verify API key in Options
- Check rate limits (default: 1 req/sec)
- See console for detailed errors

## Next Steps

- Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for architecture details
- Check [SECURITY.md](SECURITY.md) for privacy info
- Explore advanced features in the sidebar
