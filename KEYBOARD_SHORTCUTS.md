# Keyboard Shortcuts

ChatBridge now supports keyboard shortcuts for faster workflow!

## Available Shortcuts

### Quick Scan
- **Windows/Linux:** `Ctrl+Shift+S`
- **Mac:** `Command+Shift+S`
- **Action:** Opens the sidebar (if closed) and triggers a conversation scan

### Toggle Sidebar
- **Windows/Linux:** `Ctrl+Shift+H`
- **Mac:** `Command+Shift+H`
- **Action:** Shows/hides the ChatBridge sidebar

### Close View
- **Windows/Linux:** `Escape`
- **Mac:** `Escape`
- **Action:** Closes internal views (Summarize, Rewrite, etc.) or the sidebar if no views are open

### Insert to Chat
- **Windows/Linux:** `Ctrl+Shift+I`
- **Mac:** `Command+Shift+I`
- **Action:** Inserts processed text from visible view (Summarize/Rewrite/Translate) into the chat input

## Site Restrictions

For security and performance, ChatBridge only activates on approved AI platforms:

- **ChatGPT:** chat.openai.com, chatgpt.com
- **Claude:** claude.ai
- **Gemini:** gemini.google.com
- **Perplexity:** perplexity.ai
- **Poe:** poe.com
- **X.AI:** x.ai
- **Copilot:** copilot.microsoft.com
- **Bing:** bing.com
- **Meta AI:** meta.ai
- **Mistral:** chat.mistral.ai
- **DeepSeek:** deepseek.ai

The floating avatar will only appear on these sites.

## Customization

You can customize keyboard shortcuts:
1. Go to `chrome://extensions/shortcuts`
2. Find "ChatBridge"
3. Click the pencil icon next to any command
4. Press your preferred key combination
5. Click "OK"

## Implementation Notes

- Keyboard shortcuts work invisibly - no UI changes
- Commands programmatically trigger existing buttons/actions
- Background script forwards commands to the active tab
- Content script validates site before executing commands
- Toast notification shows when insert action is unavailable
