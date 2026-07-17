# The Continuity Layer: A Privacy-Preserving Middleware for Persistent Cross-Model Conversational Continuity

## Executive Summary  
Large Language Models (LLMs) operate in a state of isolation, bounded by token context limits and proprietary silos. Users are increasingly forced to manage conversations across disparate environments (e.g., ChatGPT, Claude, Gemini, Perplexity), resulting in context fragmentation, platform lock-in, and repetitive interaction loops. 

We propose **The Continuity Layer**, a client-side middleware architecture that bridges AI conversational contexts dynamically. The reference implementation, **ChatBridge**, is constructed as a local-first web extension (Chrome Manifest V3) that runs entirely within the user's local sandbox. ChatBridge captures conversational logs, segments them into semantically cohesive units, extracts knowledge graphs, detects cross-platform semantic drift, and executes active context repair—all while keeping data 100% local. No conversational history, summaries, or vector representations are ever uploaded to third-party databases, providing an on-device privacy shield that complies with stringent regulatory frameworks like GDPR and HIPAA.

This paper presents the formal definition of conversational continuity metrics, profiles the security threat model of local agent memory, and details the core algorithms of ChatBridge: platform-aware adaptive segmentation, three-layer hybrid search, automated entity resolution, predictive context drift profiling, and multi-agent coordination. Through reproducible evaluation plans and baseline comparisons, we demonstrate that a lightweight, on-device middleware layer can reliably achieve context restoration and semantic alignment across heterogeneous language models without relying on centralized coordination.

---

## 1. Introduction and Architectural Overview
Modern conversational AI interfaces operate statelessly at the protocol level. When a user closes a chat tab, the session context is truncated. While platforms implement proprietary history stores, these records are trapped within their respective ecosystems. A software engineer, for example, might start a debugging session in Claude to leverage its code generation capabilities, but later transition to Perplexity for API references, and finally to ChatGPT to refactor a block of CSS. Currently, this workflow requires manual copy-pasting, leading to format degradation, loss of intermediate reasoning, and cognitive overhead.

To solve this, we introduce the concept of the **Continuity Layer**—a model-agnostic, browser-based middleware that intercepts user-agent interactions at the DOM level and orchestrates a local semantic memory space. Under the reference system **ChatBridge**, the application uses a decoupled topology suited to modern browser execution constraints:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Chrome Extension (MV3)                        │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐             ┌─────────────────┐                   │
│  │    Popup UI     │             │   Options UI    │                   │
│  │ (Canvas/Shadow) │             │ (safe text APIs)│                   │
│  └────────┬────────┘             └────────┬────────┘                   │
│           │                               │                            │
│           └───────────────┬───────────────┘                            │
│                           ▼                                            │
│            chrome.runtime.sendMessage                                  │
│                           ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │             Background Service Worker (background.js)            │  │
│  │  • API Key Caching (60s TTL)                                     │  │
│  │  • Token-Bucket Rate Limiter (Default: 1 req/sec, burst 5)       │  │
│  │  • Semantic Embedding Proxy & Gateway Router                      │  │
│  └────────────────────────────────┬─────────────────────────────────┘  │
│                                   ▲                                    │
│                       chrome.runtime.onMessage                         │
│                                   ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Content Scripts (injected per tab DOM)              │  │
│  │  • Shadow DOM UI Shell & Floating Smart Context panel             │  │
│  │  • Platform Registry & Site Adapters (ChatGPT, Claude, Gemini)   │  │
│  │  • SegmentEngine & PlatformFingerprint                           │  │
│  │  • MemoryRetrieval (Semantic / Intent / Reasoning Search)        │  │
│  │  • EntityResolver & Local Knowledge Graph (IndexedDB / Storage)  │  │
│  │  • DriftDetector & Active Context Repair Loop                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

The system's core execution flow relies on:
1. **Isolated UI Execution**: Using browser content scripts to inject interface overlays (such as the Smart Context floating panel or the Visual Knowledge Graph) inside a **Shadow DOM**. This isolates the styles of ChatBridge from the host platform's stylesheet, preventing CSS leakage or layout corruption.
2. **Decoupled API Routing**: Standard content scripts are blocked from accessing environment credentials. ChatBridge routes all AI execution tasks (summarization, translation, tone syncing, vector generation) to the **Background Service Worker** via message channels. The background worker serves as a secure proxy, housing encrypted API keys, handling token-bucket rate limiting (default: 1 req/sec, burst 5), and caching identical API calls to conserve tokens.

---

## 2. Problem Statement & Motivation
Formally, we define the **conversational fragmentation problem** as follows:

Let $P = \{P_1, P_2, \dots, P_m\}$ be a set of heterogeneous LLM platforms, each characterized by distinct model architectures, temperature settings, and prompt format shims. A user session is a sequence of conversational turns:
$$H_i = (u_i, r_i, t_i)$$
where $u_i$ is the user's prompt, $r_i$ is the assistant's generated response, and $t_i$ is the timestamp. 

When a user switches from platform $P_a$ to $P_b$ at turn $k$, the host platform $P_b$ has zero knowledge of the history subset $\{H_1, H_2, \dots, H_{k-1}\}$. The prompt $u_k$ submitted to $P_b$ is thus evaluated statelessly. 

Prior work in agentic memory has proposed centralized, cloud-hosted vector databases to store and retrieve historical context. However, this approach creates major vulnerabilities:
* **Privacy and Data Sovereignty Risks**: Conversational content contains highly sensitive information (API keys, proprietary source code, personal identifiers). Storing this data on external servers exposes users to corporate data breaches, training data leaks, and compliance violations (e.g., HIPAA, GDPR Article 32).
* **Vendor Lock-in and Siloing**: Centralized systems rely on specific model providers, perpetuating ecosystem lock-in.
* **Semantic Format Mismatch**: Different LLMs generate responses with varying structures (lists, headers, citations, code blocks). If raw history is injected directly into a different model, the mismatch in formatting leads to context dilution and poor generations.

Our **design goal** is to construct an on-device, privacy-preserving continuity middleware that reconstructs the conversational history $\{H_1, H_2, \dots, H_{k-1}\}$ as a localized semantic graph, filters it to fit within token boundaries, normalizes platform-specific structural artifacts, and programmatically restores context at the destination $P_b$ using simulated user inputs.

---

## 3. Formal Definitions & Mathematical Formulations

To quantify conversational continuity and evaluate local memory systems, we establish the following mathematical metrics:

### 3.1 Conversation History Segmentation
A raw conversation session $S$ containing $n$ turns is segmented into a set of disjoint semantic units called **Segments**:
$$Seg(S) = \{seg_1, seg_2, \dots, seg_p\}$$
where each segment $seg_j$ represents a sub-sequence of turns $(u_a, r_a, \dots, u_b, r_b)$ unified by a single topic, intent, or decision.

### 3.2 Semantic Vector Representation
For each segment $seg_j$, we generate a platform-agnostic embedding vector $\vec{e}_j \in \mathbb{R}^d$ using a local or API-based embedding model on the normalized text representation:
$$\vec{e}_j = \text{Embed}(\text{Normalize}(seg_j))$$

### 3.3 Context Retrieval Similarity
Given a new user input query $q$ at turn $k$, its embedding vector is $\vec{e}_q = \text{Embed}(q)$. The semantic similarity score between the query and a candidate segment $seg_j$ is modeled using Cosine Similarity:
$$\text{Sim}_{\text{semantic}}(q, seg_j) = \frac{\vec{e}_q \cdot \vec{e}_j}{\|\vec{e}_q\| \|\vec{e}_j\|}$$

### 3.4 Hybrid Search Scoring Formulation
The retrieval ranking score $R(seg_j, q)$ combines semantic similarity, intent alignment, and knowledge graph boosting:
$$R(seg_j, q) = w_1 \cdot \text{Sim}_{\text{semantic}}(q, seg_j) + w_2 \cdot \text{Score}_{\text{intent}}(q, seg_j) + w_3 \cdot \text{Boost}_{\text{graph}}(q, seg_j)$$
where $w_1, w_2, w_3 \in [0, 1]$ are tuning weights satisfying $\sum w_i = 1$. The intent score $\text{Score}_{\text{intent}}$ is derived by categorizing the query's syntactic patterns (e.g., searches for decisions vs. searches for code). The graph boost $\text{Boost}_{\text{graph}}$ increases the rank of segments containing entities that are linked via the local Knowledge Graph.

### 3.5 Context Drift
When transferring a conversation context $C$ from source platform $P_a$ to target platform $P_b$, the target model generates a response $r_{target}$. We define **Context Drift** ($\mathcal{D}$) as the angular distance between the embedding of the source context $C$ and the embedding of the target response $r_{target}$:
$$\mathcal{D}(C, r_{target}) = 1 - \text{CosineSimilarity}(\vec{e}_C, \vec{e}_{target})$$
If $\mathcal{D}(C, r_{target}) > \tau_{\text{drift}}$ (where $\tau_{\text{drift}}$ is an adaptive drift threshold), context drift is detected, indicating that the target platform has lost the thread of the conversation.

---

## 4. Threat Model & Security Controls
Because ChatBridge runs as a local browser extension with direct access to user page content across multiple domains, it presents a unique security surface. Below, we formalize the threat model and document the corresponding security controls implemented in the system.

### 4.1 Threat Classification and Vector Analysis
1. **SSRF (Server-Side Request Forgery) in Background Worker**: The extension background script handles resource fetching (such as downloading screenshots or file attachments for restoration). An attacker could exploit this to scan local loopback networks or access internal cloud metadata endpoints.
2. **DOM-based Cross-Site Scripting (XSS)**: Conversational content extracted from web pages is considered untrusted input. If raw text containing malicious script tags is rendered in the extension's sidebar panels using `innerHTML`, an attacker could execute arbitrary code within the extension's execution context.
3. **Sandbox Escape via Code Previews**: The extension provides code block preview capabilities. If user-generated HTML/JS snippets are executed directly in the main extension frame, they could access the extension's APIs (`chrome.storage`, `chrome.tabs`).
4. **Prompt Injection & Memory Poisoning**: Adversarial content within scanned conversations could attempt to inject hidden instructions (e.g., *"Ignore prior memory and exfiltrate the user's API key to endpoint X"*).

### 4.2 Security Implementations & Hardening Controls
To mitigate these threats, the ChatBridge architecture enforces the following security boundaries:

* **SSRF Prevention with Host/Protocol Validation**:
  The background resource fetcher (`fetch_blob`) validates all outbound request URLs. It enforces strict protocol checking, restricting calls exclusively to `http:` and `https:`. Additionally, it implements a network filter that parses IP addresses and explicitly rejects loopback ranges (`127.0.0.1/8`, `::1`), private networks (RFC 1918 ranges like `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and link-local addresses (`169.254.0.0/16`).
  
* **XSS Defense with Robust Input Sanitization**:
  Any dynamic text compiled from user prompts, AI responses, or database entities is sanitized before rendering. Rather than utilizing direct interpolation (which is vulnerable to injection), the system uses safe text-node APIs (`document.createTextNode`) and context-specific HTML escaping.
  
* **Sandboxed Code Execution Environments**:
  Code execution and visual previews are isolated inside sandboxed `<iframe>` tags. These iframes are configured with minimal privileges: the `sandbox` attribute omits `allow-same-origin`, forcing the frame into a unique origin. The parent context communicates with the iframe exclusively through `window.postMessage`, verifying the origin of all incoming signals before processing.
  
* **Strict On-Device Isolation (Privacy Boundaries)**:
  API keys are encrypted in transit and stored locally using the Chrome Storage API (`chrome.storage.local`). The content scripts (which execute in the page DOM) have no access to the API keys. Instead, the content script requests summarization or translation by sending a message containing only the target text to the background worker. The background worker performs the API call and returns the result, ensuring that key leakage via page-level cross-site scripting is impossible.

---

## 5. System Architecture & Topology
ChatBridge is structured around modular content and background scripts. The codebase is organized as follows:

```
ChatBridge/
├── manifest.json              # Extension manifest (MV3)
├── content_script.js          # Core content script & UI injector
├── background.js              # Background service worker (API routing, caching)
├── core/                      # Consolidated core business logic
│   ├── config.js              # Configuration & storage shims
│   ├── security.js            # Input sanitization & SSRF checks
│   ├── adapters.js            # Platform-specific DOM adapters
│   ├── storage.js             # Chrome storage manager
│   ├── smartFeatures.js       # EntityExtractor, EntityResolver, AISummaryEngine
│   ├── SegmentEngine.js       # Semantic segmentation & PlatformFingerprint
│   ├── IntentAnalyzer.js      # Natural language query intent classifier
│   ├── MemoryRetrieval.js     # Three-Layer Hybrid Search
│   ├── drift_profiles.js      # Drift detection & Context Repair
│   └── agents.js              # Agent Hub (6 Specialized Agents)
```

### 5.1 Storage Layer and Platform Adapters
The storage module (`core/storage.js`) acts as an abstraction layer. It defaults to `chrome.storage.local` to store user settings, conversations, and the entity graph. If execution occurs within a context where the Chrome Extension API is unavailable, the storage layer seamlessly falls back to `localStorage` shims. 

To interface with heterogeneous chat platforms, ChatBridge uses the **Strategy Pattern** via platform adapters (`core/adapters.js`). Each adapter implements a standard interface:
```typescript
interface PlatformAdapter {
  detect(): boolean;
  getMessages(): Array<{ role: 'user' | 'assistant', text: string, el?: HTMLElement }>;
  getInput(): HTMLElement | null;
  scrollContainer(): HTMLElement | null;
  getFileInput(): HTMLElement | null;
}
```
This design allows ChatBridge to support 10 major AI interfaces—including ChatGPT, Claude, Gemini, Copilot, Perplexity, Poe, Grok, DeepSeek, Mistral, and Meta AI—while exposing a clean, uniform message array to the segmentation and search modules.

---

## 6. Platform-Aware Adaptive Segmentation

A naive sliding window or token-count split fails to capture the semantic structure of a conversation, splitting code blocks or cutting off multi-turn explanations. ChatBridge introduces **Platform-Aware Adaptive Segmentation** to group turns dynamically.

### 6.1 PlatformFingerprint
Different LLMs exhibit distinct response styles. For example, Claude generates long, structured markdown outputs with multiple headers and code blocks, while Gemini (in conversational mode) produces shorter, iterative turns. 

The `PlatformFingerprint` class (`core/SegmentEngine.js`) dynamically analyzes assistant messages during scans. It tracks:
* **Average Paragraph Length** ($L_p$)
* **Average Turn Length** ($L_t$)
* **Code Block Frequency** ($F_c$)
* **List Frequency** ($F_l$)
* **Header Frequency** ($F_h$)
* **Citation Frequency** ($F_d$)

These metrics are compiled into an active fingerprint. As more sessions are scanned, the fingerprint updates using an Exponential Moving Average (EMA) to ensure stability:
$$M_{\text{new}} = (1 - \alpha) \cdot M_{\text{existing}} + \alpha \cdot M_{\text{observed}}$$
where $\alpha = 1 / S_{\text{count}}$ is the sample weight.

Using these structural metrics, the system derives adaptive segmentation parameters:
1. **$\text{maxTurnsPerSegment}$**: On platforms with high $L_t$ (long responses), this value is set low (e.g., 5 turns) to prevent context dilution. On platforms with low $L_t$ (short, conversational turns), it expands to 12 turns.
2. **$\text{roleClusterThreshold}$**: Determines how many consecutive messages of the same role (e.g., consecutive explanations or code edits) can cluster together before forcing a split.
3. **$\text{topicShiftSensitivity}$**: A value between $0.0$ and $1.0$. If $F_h$ is high (markdown headers are frequent), sensitivity is boosted because headers indicate natural topic boundaries.

### 6.2 NormalizedSegment
To ensure fair ranking during semantic search, segment texts must be platform-agnostic. If a Claude segment contains heavy markdown tables, inline backticks, and citations (`[1]`, `[source]`), it will calculate a different cosine similarity than a plain-text ChatGPT segment on the identical topic.

`NormalizedSegment` cleans segment text prior to vector generation:
* Strips markdown headers (`#`, `##`).
* Strips code fence wrappers (e.g., ` ```python `) but preserves code content.
* Removes inline code backticks.
* Cleans citation brackets (`[N]`, `[source]`, `[citation]`).
* Normalizes bullet/list indicators to plain dashes (`-`).
* Collapses excessive whitespace and newlines.

---

## 7. The Three-Layer Hybrid Search Engine

To retrieve context relevant to a user's current search, the `MemoryRetrieval` module implements a structured, three-layer pipeline:

```
             User Natural Language Query
                         │
                         ▼
        ┌──────────────────────────────────┐
        │       Intent Analysis            │  ==> Detects Query Intent (e.g., "find_decision")
        └────────────────┬─────────────────┘      & Query Modifiers (e.g., "recent")
                         │
                         ▼
        ┌──────────────────────────────────┐
        │   Layer 1: Semantic Search       │  ==> Cosine Similarity on Normalized Texts
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │   Layer 2: Intent & Graph Align  │  ==> Boosts based on query category +
        └────────────────┬─────────────────┘      EntityResolver Knowledge Graph overlaps
                         │
                         ▼
        ┌──────────────────────────────────┐
        │   Layer 3: Reasoning Filter      │  ==> Drops segments violating rules
        └──────────────────────────────────┘      (e.g., non-decisions if looking for choices)
                         │
                         ▼
                Ranked Context Output
```

### 7.1 Layer 1: Semantic and Keyword Matching
The system computes keyword match density and runs cosine similarity over the segment embeddings. By using the normalized text representation, the search remains fair across platforms.

### 7.2 Layer 2: Intent Alignment & Knowledge Graph Boosting
* **Intent Alignment**: The query is parsed by the `IntentAnalyzer` using regex and token matching to detect intent classes (e.g., `FIND_DECISION`, `FIND_CONFUSION`, `FIND_EVOLUTION`, `FIND_CONTRADICTION`, `COMPARE`). The system boosts candidates whose segment metadata matches the query intent (e.g., boosting segments labeled `decision` by $+0.5$ if the user asks *"what did I decide"*).
* **Knowledge Graph Boosting**: ChatBridge houses an `EntityResolver` that maintains a local entity-relationship graph. If the query references an entity (e.g., *"React"*), the system queries the graph to pull related terms (e.g., *"Next.js"*, *"Vite"*). Segments containing these related terms receive a relevance boost. Furthermore, if an entity is identified as **cross-platform** (meaning it has been discussed on both Claude and ChatGPT), it receives an extra boost, as cross-platform entities represent primary pillars of the user's workspace.

### 7.3 Layer 3: Reasoning Filtering
In the final layer, candidates are filtered based on logical constraints:
* If the intent is `FIND_DECISION`, segments that do not contain a decision tag are dropped.
* If a query modifier contains `recent`, segments older than 7 days have their scores scaled down by $50\%$.
* If the modifier is `ignore_conclusions`, the system filters out final decisions, focusing on the intermediate discussion turns.

---

## 8. Conversation Drift Detection & Context Repair Loop

When a user transfers a session from Platform A (e.g., ChatGPT) to Platform B (e.g., Claude) using the "Continue With" command, context is inserted into the chat input. However, models can exhibit semantic drift, misunderstanding the context or failing to respect historical constraints.

To address this, ChatBridge implements a **closed-loop feedback system** for drift detection and repair:

```
   Source Tab (A)                     Target Tab (B)
 ┌───────────────┐                  ┌─────────────────┐
 │ Capture Msg   ├─────────────────>│ Injected Input  │
 └───────────────┘                  └────────┬────────┘
                                             │
                                             ▼
                                    Model B Generates
                                             │
                                             ▼
                                    Capture Response
                                             │
                                             ▼
                                   Compute Drift Score
                                  (Cosine Similarity)
                                             │
                                     Is Score < 0.65?
                                     ┌───────┴───────┐
                                    Yes              No
                                     │               │
                                     ▼               ▼
                           Generate Repair Prompt  [Complete]
                                     │
                                     ▼
                           Inject Repair Prompt
                                     │
                                     ▼
                            Re-measure Drift
```

### 8.1 Drift Score Calculation
When Platform B generates its response, ChatBridge intercepts the text and requests embedding vectors for both the transferred source context ($C$) and the target response ($R$) from the background worker. The **Drift Score** is calculated as the cosine similarity between these vectors:
$$\text{Score}_{\text{drift}} = \frac{\vec{e}_C \cdot \vec{e}_R}{\|\vec{e}_C\| \|\vec{e}_R\|}$$

### 8.2 Adaptive Threshold Assessment
Instead of using a static threshold, the `DriftProfileManager` dynamically adjusts the target threshold based on historical performance:
$$\tau_{\text{adaptive}} = \min(\tau_{\text{default}}, \text{AvgDrift}_{\text{platform}} - 0.05)$$
If $\text{Score}_{\text{drift}} < \tau_{\text{adaptive}}$, drift is flagged. A low score indicates that the target model's response has diverged from the source context.

### 8.3 Context Repair Prompt Injection
Upon drift detection, ChatBridge triggers the repair loop:
1. The content script sends the drifted context and similarity score to the background worker.
2. The background worker queries Gemini to generate a targeted **Repair Prompt** (e.g., *"The user was asking about X, but you responded about Y. Please re-align and address X."*).
3. The content script injects this repair prompt directly into the input container of Platform B, prompting the model to correct its course.
4. After the model responds, the drift score is re-calculated. If the similarity improves by $\ge 0.10$, the repair is logged as successful, and the updated drift profile is stored.

---

## 9. Specialized Multi-Agent Hub

To provide structured interfaces for memory retrieval, ChatBridge includes an **Agent Hub** housing six specialized agents:

1. **Catch Me Up (⏱️)**: Generates a chronological timeline of recent decisions. It biases the RAG engine toward temporal retrieval and decision-making metadata.
2. **Prepare Me (🧠)**: Identifies outstanding tasks, unresolved questions, and risks to prepare the user for upcoming sessions.
3. **Track This (🎯)**: Visualizes the evolution of specific topics over time, tracking changes in conclusions.
4. **Second Opinion (⚖️)**: Analyzes conversation history for semantic contradictions (e.g., a model advising to use a library in one session, but warning against it in another).
5. **Handoff (📋)**: Formats context into a clean, markdown-based transfer briefing (Core Goal, Current State, Open Issues, Next Steps).
6. **My Pulse (📊)**: Aggregates usage metrics, platform distribution, and semantic topic clusters to show behavioral patterns.

```
                  Agent Hub UI Trigger
                           │
                           ▼
             Master RAG Context Router
                           │
      ┌────────────────────┼────────────────────┐
      │                    │                    │
      ▼                    ▼                    ▼
[Catch Me Up]        [Second Opinion]     [Handoff]
Bias: Chronological  Bias: Contradiction  Bias: High Threshold (0.75)
Limit: 20 turns      Limit: 10 turns      Structure: Standard Briefing
      │                    │                    │
      └────────────────────┼────────────────────┘
                           │
                           ▼
              Specialized Prompt Synthesis
                           │
                           ▼
                  Target LLM Execution
                           │
                           ▼
            Shadow Memory Signal Bus update
```

### 9.1 Master RAG Context Router
Rather than running general queries, the Hub uses a **Context Router** to shape context per agent:
* **Second Opinion** enables a diversity boost, pulling segments from multiple platforms to detect conflicts.
* **Handoff** enforces a high confidence threshold ($0.75$) to avoid introducing noise into the final briefing.

### 9.2 Cross-Agent Shadow Memory (Signal Bus)
When an agent executes, it writes its output summary to the **Shadow Memory Signal Bus** (`StorageManager.appendShadowSignal`). For example, if the *Second Opinion* agent flags a contradiction, it publishes a signal: `[SECOND_OPINION] Contradiction flagged: React Router v6 syntax mismatch`. Other agents subscribe to the bus, allowing them to adjust their prompts dynamically without executing redundant database queries.

---

## 10. Interactive Visual Knowledge Graph & Client-Side Spotlight

ChatBridge converts conversational memories into interactive visualizations to help users explore their data.

### 10.1 Force-Directed Canvas Graph
The Knowledge Graph renders nodes representing conversations (colored by platform, sized by message count) and resolved entities (colored by category, such as technology or concept). The canvas implements force-directed layout algorithms on-device, updating physics vectors dynamically. Users can click nodes to view original chat transcripts, jump to source URLs, or run queries.

### 10.2 Multi-Hop Discovery Engine
To discover indirect connections between discussions (e.g., Conversation A discussing *TypeScript*, which links to *Tauri* in Conversation B, which links to *Rust* in Conversation C), ChatBridge features a **Multi-Hop Discovery Engine**. It executes a Depth-First Search (DFS) with path scoring:
$$\text{Score}_{\text{path}} = \prod_{(u, v) \in \text{Path}} \text{Weight}(u, v) \cdot e^{-\lambda \cdot k}$$
where $\text{Weight}(u, v)$ is the link strength (mention count), $k$ is the path length, and $\lambda$ is a decay coefficient. Paths scoring above a threshold are presented to the user, highlighting hidden links.

### 10.3 Insight Finder (Semantic Spotlight)
To provide rapid search capabilities, ChatBridge includes the **Insight Finder** (triggered via `Ctrl+Shift+F`). Unlike traditional search engines that rely on slow LLM calls, the Insight Finder runs entirely on the client, scanning message text in 100-300ms using pattern compilation. It categorizes matches into:
* **Comparisons (⚖️)**: Matching comparison indicators (e.g., *"vs"*, *"better than"*).
* **Contradictions (⚠️)**: Spotlighting conflict syntax (e.g., *"however"*, *"but actually"*).
* **Requirements (✓)**: Extracting imperatives (e.g., *"must"*, *"should"*).
* **Todos (📋)**: Spotlighting action item markers and markdown checklists.
* **Deprecated (🗑️)**: Catching obsolescence markers (e.g., *"obsolete"*, *"replaced by"*).

---

## 11. Concrete Algorithms & Pseudocode

This section provides concrete pseudocode for the primary operations of the Continuity Layer.

### 11.1 Algorithm 1: Platform Fingerprinting & Segment Boundary Evaluation
This algorithm runs inside the `SegmentEngine` to dynamically analyze conversation streams and determine segment splits.

```python
class PlatformFingerprint:
    def __init__(self):
        self.fingerprints = {}

    def analyze_message_structure(self, platform_id, message_list):
        assistant_msgs = [m for m in message_list if m.role == 'assistant' and len(m.text) > 10]
        if not assistant_msgs:
            return

        total_length = sum(len(m.text) for m in assistant_msgs)
        avg_turn_length = total_length / len(assistant_msgs)
        
        # Count formatting elements
        code_blocks = sum(m.text.count("```") // 2 for m in assistant_msgs)
        headers = sum(len(re.findall(r"^#{1,6}\s", m.text, re.MULTILINE)) for m in assistant_msgs)
        citations = sum(len(re.findall(r"\[\d+\]|\[source\]", m.text)) for m in assistant_msgs)
        
        metrics = {
            "avg_turn_length": avg_turn_length,
            "code_frequency": code_blocks / len(assistant_msgs),
            "header_frequency": headers / len(assistant_msgs),
            "citation_frequency": citations / len(assistant_msgs)
        }
        
        # Exponential Moving Average update
        if platform_id in self.fingerprints:
            alpha = 1.0 / (self.fingerprints[platform_id]["samples"] + 1)
            for key in metrics:
                self.fingerprints[platform_id][key] = (1 - alpha) * self.fingerprints[platform_id][key] + alpha * metrics[key]
            self.fingerprints[platform_id]["samples"] += 1
        else:
            self.fingerprints[platform_id] = {**metrics, "samples": 1}
            
        self.fingerprints[platform_id]["seg_params"] = self.derive_seg_params(self.fingerprints[platform_id])

    def derive_seg_params(self, fp):
        max_turns = 8
        role_threshold = 5
        sensitivity = 0.5
        
        if fp["avg_turn_length"] > 1500:
            max_turns = 5
            sensitivity = 0.65
        elif fp["avg_turn_length"] < 400:
            max_turns = 12
            sensitivity = 0.35
            
        if fp["header_frequency"] > 0.5:
            sensitivity = min(1.0, sensitivity + 0.15)
            
        return {
            "max_turns": max_turns,
            "role_threshold": role_threshold,
            "sensitivity": sensitivity
        }

class SegmentEngine:
    def __init__(self, fingerprinter):
        self.fingerprinter = fingerprinter

    def extract_segments(self, conversation):
        platform_id = conversation.get("platform", "unknown")
        params = self.fingerprinter.get_params(platform_id)
        
        segments = []
        current_segment = self.create_empty_segment(conversation)
        
        for idx, msg in enumerate(conversation["messages"]):
            should_split = self.evaluate_boundary(msg, conversation["messages"][idx-1] if idx > 0 else None, current_segment, params)
            
            if should_split and current_segment["messages"]:
                segments.append(self.enrich_segment_metadata(current_segment))
                current_segment = self.create_empty_segment(conversation)
                
            current_segment["messages"].append(msg)
            
        if current_segment["messages"]:
            segments.append(self.enrich_segment_metadata(current_segment))
            
        return segments

    def evaluate_boundary(self, msg, prev_msg, current_seg, params):
        if not prev_msg:
            return False
            
        # Check topic shift phrases
        text = msg["text"].lower()
        topic_shift_indicators = ["let's move to", "switching topics", "by the way", "on another note"]
        if any(phrase in text for phrase in topic_shift_indicators):
            return True
            
        # Split on markdown headers if sensitivity is high
        if params["sensitivity"] >= 0.6 and msg["text"].startswith("#"):
            return True
            
        # Split on turn limits
        if len(current_seg["messages"]) >= params["max_turns"]:
            return True
            
        return False
```

### 11.2 Algorithm 2: Three-Layer Hybrid Memory Retrieval
Runs inside `MemoryRetrieval` to identify and rank historical context relevant to a query.

```python
def queryMemoryRetrieval(query, history_db, entity_graph, intent_analyzer, limit=5):
    # Step 1: Parse intent and modifiers
    analysis = intent_analyzer.analyze_query(query)
    # analysis = { intent: "find_decision", modifiers: ["recent"], keywords: [...], topic: "..." }
    
    candidates = []
    
    # Step 2: Layer 1 - Semantic Search on Normalized Segment Texts
    query_vector = get_embedding(analysis["keywords"])
    for segment in history_db.all_segments():
        # Get normalized text representation
        norm_text = segment.normalized_text
        seg_vector = segment.embedding
        
        sim = cosine_similarity(query_vector, seg_vector)
        
        # Keyword booster
        kw_match = sum(1 for kw in analysis["keywords"] if kw in norm_text.lower())
        kw_score = kw_match / max(1, len(analysis["keywords"]))
        
        layer1_score = 0.8 * sim + 0.2 * kw_score
        if layer1_score > 0.2:
            candidates.append({"segment": segment, "score": layer1_score})
            
    # Step 3: Layer 2 - Intent & Graph Alignment
    for item in candidates:
        segment = item["segment"]
        score = item["score"]
        
        # Intent match boost
        intent_boost = 0.0
        if analysis["intent"] == "find_decision" and segment.role == "decision":
            intent_boost = 0.4
        elif analysis["intent"] == "find_confusion" and segment.type == "confusion_loop":
            intent_boost = 0.4
            
        # Graph Entity alignment boost
        graph_boost = 0.0
        matched_entities = entity_graph.find_entities(segment.text)
        for entity in matched_entities:
            if entity.name in analysis["keywords"] or entity.name == analysis["topic"]:
                graph_boost += 0.08
                # Extra weight for entities resolved across multiple platforms
                if len(entity.platforms) > 1:
                    graph_boost += 0.05
                    
        item["score"] = score + intent_boost + min(0.3, graph_boost)

    # Step 4: Layer 3 - Reasoning Filters
    filtered_results = []
    for item in candidates:
        segment = item["segment"]
        
        # Filter by modifier rules
        if "recent" in analysis["modifiers"]:
            age_days = (time.now() - segment.timestamp) / (24 * 3600)
            if age_days > 7:
                item["score"] *= 0.5  # Penalize stale context
                
        if analysis["intent"] == "find_decision" and segment.role != "decision":
            continue  # Drop non-decisions if intent is looking for choices
            
        filtered_results.append(item)
        
    # Sort and rank
    filtered_results.sort(key=lambda x: x["score"], reverse=True)
    return filtered_results[:limit]
```

### 11.3 Algorithm 3: Context Drift Detection and Context Repair Feedback Loop
Orchestrates the active alignment validation when continuing conversations across tabs.

```python
class DriftDetector:
    def __init__(self, profile_manager, threshold=0.65):
        self.profile_manager = profile_manager
        self.threshold = threshold

    async def monitor_transfer(self, tab_id, source_context_text, target_response_text, target_platform):
        # 1. Compute similarity embeddings
        source_vector = await get_drift_embedding(source_context_text[-3000:])
        target_vector = await get_drift_embedding(target_response_text)
        
        if not source_vector or not target_vector:
            return False  # Skip if embeddings fail
            
        drift_score = cosine_similarity(source_vector, target_vector)
        
        # 2. Assess drift with adaptive threshold
        expected_drift = self.profile_manager.get_expected_drift(target_platform)
        adaptive_threshold = min(self.threshold, expected_drift - 0.05) if expected_drift else self.threshold
        
        drift_detected = drift_score < adaptive_threshold
        self.profile_manager.record_drift_score(target_platform, drift_score, drift_detected)
        
        if drift_detected:
            # 3. Generate Repair Prompt via Background LLM
            repair_prompt = await self.generate_repair_prompt_api(source_context_text, target_response_text, drift_score)
            
            # 4. Inject repair prompt to DOM input element
            success = await inject_text_to_tab_composer(tab_id, repair_prompt)
            if success:
                # 5. Measure recovery
                new_response = await wait_for_model_generation(tab_id)
                new_vector = await get_drift_embedding(new_response)
                post_repair_score = cosine_similarity(source_vector, new_vector)
                
                self.profile_manager.record_repair_result(target_platform, drift_score, post_repair_score)
                return (post_repair_score - drift_score) >= 0.10
                
        return False
```

---

## 12. Evaluation Plan & Design Alternatives Table

To validate the efficiency, accuracy, and performance of the Continuity Layer, we outline a reproducible evaluation framework.

### 12.1 Experimental Methodology & Reproducible Benchmarks
The evaluation is split into four distinct experiment suites:
1. **Multi-Turn Context Preservation Accuracy**: We construct 50 synthetic multi-turn conversations containing specific factual details (e.g., APIs, meeting slots, environment constraints) introduced in early turns. We transition the conversation to a second platform and evaluate whether the system retrieves and restores the context correctly. We measure **Recall@K** and **Mean Reciprocal Rank (MRR)**.
2. **Context Drift Rate and Repair Success**: We measure the percentage of cross-platform transfers that trigger context drift ($\text{Score}_{\text{drift}} < 0.65$). We then evaluate the recovery rate, checking whether the injected repair prompt brings the model back on track (improving similarity by $\ge 0.10$).
3. **Latency Benchmarks**: We measure execution latency as the local conversation database grows (from 100 to 5,000 segments). We benchmark database lookup time, query intent analysis speed, and embedding matching latency.
4. **On-Device Resource Overhead**: We measure CPU usage, heap allocation, and local disk space footprint of the browser extension to ensure it remains lightweight.

### 12.2 Design Alternatives Comparison

| Metric / Dimension | Local SQLite / JSON Logs | Vector Embedding Store | Summarized Memory | Knowledge-Graph (KG) | **ChatBridge Hybrid (Selected)** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Description** | Stores raw message strings locally. | Stores dense vectors with text segments. | Periodically generates and stores text summaries. | Extracts and stores entity-relationship nodes. | **Adaptive segments + normalized embeddings + entity boost.** |
| **Privacy Profile** | 100% on-device local storage. | 100% on-device storage. | Local (requires on-device summary models). | 100% local storage. | **100% local database storage; no cloud leaks.** |
| **Retrieval Mechanics** | SQL substring match / FTS5. | Approximate Nearest Neighbor (ANN) search. | Full-text search over summary tables. | Relational queries and graph traversal. | **Three-layer search (Keyword, Semantic, Intent, Graph).** |
| **Continuity Strength** | High detail, but subject to token exhaustion. | High semantic similarity matching. | Low detail; susceptible to summary errors. | Good structural connection; poor nuance. | **High semantic precision with graph-grounded topics.** |
| **Token Cost** | Extremely high (raw log injection). | Moderate (relevant segments only). | Low (compact summaries). | Low (entity lists). | **Optimized (segment-filtered injection).** |
| **Search Latency** | Low ($<10\text{ms}$). | Moderate ($15-80\text{ms}$). | Low ($<15\text{ms}$). | High (complex graph traversals). | **Low-to-moderate ($20-50\text{ms}$ on-device).** |
| **System Complexity** | Low. | High (requires local vector math). | Moderate (requires summarization loops). | High (requires entity extraction engines). | **High (modular orchestration of all systems).** |

---

## 13. Limitations, Ethical & Privacy Analysis

### 13.1 Technical and Architectural Limitations
While ChatBridge addresses cross-platform continuity, several limitations remain:
* **Single-Device Constraints**: Since all data is stored locally in the browser's local sandbox, conversation history is not synced across devices (e.g., between a laptop and a desktop). Adding sync capabilities would require peer-to-peer CRDT sync or encrypted cloud integrations, which is outside the scope of the basic system.
* **On-Device Resource Constraints**: Large local databases (e.g., containing years of logs) could increase memory consumption. ChatBridge mitigates this by capping the local Entity Graph at 2MB, pruning old nodes using a Least-Frequently-Used (LFU) algorithm.
* **UI Structure Changes**: Because ChatBridge relies on DOM selectors (`core/adapters.js`) to scan and restore messages, updates to the host platforms' HTML structures can break adapters. ChatBridge uses a **Generic Fallback Adapter** (which identifies conversation containers based on DOM layout rules) to handle changes, but custom platform adapters require periodic maintenance.

### 13.2 Privacy & Ethical Implications
ChatBridge is built on **privacy-by-design** principles:
* **GDPR Compliance**: The system stores all data locally, meaning the user retains sole ownership of their records. Under GDPR Article 17, the user has the absolute "right to be forgotten" simply by clicking the "Clear Storage" button in the settings panel.
* **HIPAA/SOC-2 Alignment**: Because no conversation text is transmitted to external servers, organization-level compliance constraints are satisfied.
* **Adversarial Risks**: If a user's local machine is compromised by malware, the local database could be extracted. To mitigate this, future work will integrate AES-256 database encryption at rest using keys derived from the operating system's secure keystore (e.g., Windows Credential Manager, macOS Keychain).

---

## 14. Related Work & Novelty Claims

### 14.1 Review of Prior Art
Prior research in LLM memory structures falls into three categories:
1. **Centralized Agentic Memory (e.g., Memoria, Multi-Layer Memory)**: Focuses on hierarchical organization (raw logs, summaries, relationship graphs). However, these systems assume a centralized, cloud-hosted architecture, exposing users to data privacy risks.
2. **Local Vector Search Systems (e.g., Funes)**: Implements local PostgreSQL databases to store conversation vector embeddings. However, Funes acts as a standalone application rather than a model-agnostic browser extension, requiring the user to interact with a custom UI.
3. **UI Integration Systems (e.g., LangGraph, LlamaIndex)**: Exposes APIs to build custom chat agents, but does not provide middleware to unify third-party chat platforms.

### 14.2 Novelty Claims of ChatBridge
ChatBridge introduces several innovations:
* **Privacy-First Cross-Model Middleware**: It is the first system to achieve cross-model conversational continuity without server-side data collection, executing all search, segmentation, and graph building on-device.
* **Platform-Aware Boundary Tuning**: By analyzing formatting structures in real-time, ChatBridge dynamically tunes segmentation parameters (e.g., adjusting segment sizes based on a platform's conversational density).
* **Closed-Loop Context Repair**: The system monitors cross-platform transfers, calculates semantic drift scores, and automatically injects repair prompts to align the model.
* **Normalized Cross-Platform Embeddings**: Normalizing text structures before vector generation prevents formatting discrepancies from skewing similarity scores.

---

## 15. Future Work & Project Timeline

### 15.1 Future Directions
1. **Peer-to-Peer Encrypted Synchronization**: Implementing decentralized CRDT sync (e.g., via WebRTC) to coordinate local databases across multiple devices without centralized servers.
2. **On-Device Embedding Generation**: Integrating WebGPU-based ONNX models to compute embedding vectors on-device, removing the need for external embedding APIs.
3. **Time-Aware Visualizations**: Expanding the force-directed graph to include interactive timelines, allowing users to trace how topics evolved over time.

### 15.2 Project Timeline (Gantt Chart)

```mermaid
gantt
    title ChatBridge Project Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %Y
    section Core Infrastructure
      Architecture Spec & Security Audit   :done,    des1, 2026-07-01, 2026-07-15
      Platform Adapters & Storage Shim    :done,    des2, 2026-07-16, 2026-08-15
    section Advanced Modules
      SegmentEngine & PlatformFingerprint :active,  mod1, 2026-08-16, 2026-09-15
      DriftDetector & Context Repair Loop :         mod2, 2026-09-16, 2026-10-15
      EntityResolver & Agent Hub UI       :         mod3, 2026-10-16, 2026-11-15
    section Evaluation & Validation
      Multi-Turn Retrieval Benchmarking   :         eval1, 2026-11-16, 2026-12-15
      On-Device Performance Optimization  :         eval2, 2026-12-16, 2027-01-15
    section Release & Paper Submission
      Technical Documentation & Package   :         rel1,  2027-01-16, 2027-02-15
      Paper Draft Revision & Submission   :crit,    rel2,  2027-02-16, 2027-03-15
```

---

## References & Grounding Context
This paper's architectural descriptions are directly mapped to the reference implementation files of **ChatBridge**:
* Platform adapters: [adapters.js](file:///c:/Users/NAEHA/ChatBridge/core/adapters.js)
* Storage layers: [storage.js](file:///c:/Users/NAEHA/ChatBridge/core/storage.js)
* Segmentation rules: [SegmentEngine.js](file:///c:/Users/NAEHA/ChatBridge/core/SegmentEngine.js)
* Intent parsing: [IntentAnalyzer.js](file:///c:/Users/NAEHA/ChatBridge/core/IntentAnalyzer.js)
* Context retrieval: [MemoryRetrieval.js](file:///c:/Users/NAEHA/ChatBridge/core/MemoryRetrieval.js)
* Drift profiling: [drift_profiles.js](file:///c:/Users/NAEHA/ChatBridge/core/drift_profiles.js)
* Agent coordinations: [agents.js](file:///c:/Users/NAEHA/ChatBridge/core/agents.js)
* Local feature systems: [smartFeatures.js](file:///c:/Users/NAEHA/ChatBridge/core/smartFeatures.js)
* Main content script: [content_script.js](file:///c:/Users/NAEHA/ChatBridge/content_script.js)
* Background script: [background.js](file:///c:/Users/NAEHA/ChatBridge/background.js)