1. "Context Boost" — Pre-prompt enhancer
Before you type a prompt, this injects relevant context from your past conversations into a hidden system-level preamble. You type "help me with the auth flow" and ChatBridge silently adds "User previously discussed OAuth2 with PKCE, chose Supabase, uses React+Next.js" so the AI already knows your stack. Zero effort from the user.

2. "Merge" — Conversation stitcher
User had 5 separate chats about the same project (auth on ChatGPT, database on Claude, deployment on Gemini). Merge combines them into one coherent thread, deduplicates overlapping content, and arranges chronologically. Creates a unified project document from scattered AI chats.

3. "Compare" — Side-by-side response comparison
A tab where you paste the same prompt to 2+ platforms and see responses side-by-side with a diff-like highlight of where they agree/disagree. This is a unique ChatBridge capability — no single AI platform can do this.

4. "Pin & Collect" — Cross-conversation snippet collector
Users often get one great code block from ChatGPT, one explanation from Claude, one diagram idea from Gemini. A "Pin" button that lets you collect specific message snippets across platforms into a single organized workspace. Like a clipboard that persists and organizes.

5. "Fact Check" — Cross-platform verification
One-click: takes the last assistant response, sends the key claims to a different model via background.js, returns agreement/disagreement. Users constantly worry "is this AI hallucinating?" — this gives them a second opinion without switching tabs.

6. Code Collector	Extracts all code blocks from scanned conversations, organized by language, searchable, with the AI explanation attached	You have code + context together, no more digging through conversations for that one snippet.