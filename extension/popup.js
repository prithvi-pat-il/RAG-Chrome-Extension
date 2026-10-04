let sessionId = null;
let currentUrl = null;
let isProcessing = false;

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const onlineIndicator = document.getElementById("onlineIndicator");
  const questionInput = document.getElementById("questionInput");
  const sendBtn = document.getElementById("sendBtn");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const chatBody = document.getElementById("chatBody");
  const pageBanner = document.getElementById("pageBanner");
  const pageBannerText = document.getElementById("pageBannerText");
  const retryBtn = document.getElementById("retryBtn");

  // Format markdown-like text to safe HTML
  function formatContent(text) {
    if (!text) return "";
    
    // Escape HTML first to prevent XSS
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold text: **text** or __text__
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");

    // Italic text: *text* or _text_
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Line breaks to paragraphs / lists
    const lines = escaped.split("\n");
    let inList = false;
    let html = "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed)) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        const itemContent = trimmed.replace(/^([-*]|\d+\.)\s+/, "");
        html += `<li>${itemContent}</li>`;
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        if (trimmed.length > 0) {
          html += `<p>${trimmed}</p>`;
        }
      }
    });

    if (inList) {
      html += "</ul>";
    }

    return html || `<p>${escaped}</p>`;
  }

  function setStatus(state, message) {
    statusText.innerText = message;
    statusDot.className = `status-dot ${state}`;
    onlineIndicator.className = `online-indicator ${state}`;

    if (state === "ready") {
      questionInput.disabled = false;
      sendBtn.disabled = questionInput.value.trim().length === 0;
      pageBanner.classList.add("hidden");
    } else if (state === "error") {
      questionInput.disabled = true;
      sendBtn.disabled = true;
      pageBannerText.innerText = message;
      pageBanner.classList.remove("hidden");
    } else {
      questionInput.disabled = true;
      sendBtn.disabled = true;
      pageBanner.classList.add("hidden");
    }
  }

  function scrollToBottom() {
    chatBody.scrollTo({
      top: chatBody.scrollHeight,
      behavior: "smooth"
    });
  }

  function appendUserMessage(text) {
    const messagesList = document.getElementById("messagesList");
    const wrapper = document.createElement("div");
    wrapper.className = "message-wrapper user-message";

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerText = text;

    content.appendChild(bubble);
    wrapper.appendChild(content);
    messagesList.appendChild(wrapper);

    scrollToBottom();
  }

  function appendBotMessage(htmlContent) {
    const messagesList = document.getElementById("messagesList");
    const wrapper = document.createElement("div");
    wrapper.className = "message-wrapper bot-message";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    const img = document.createElement("img");
    img.src = "logo1.png";
    img.alt = "AI";
    avatar.appendChild(img);

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = htmlContent;

    content.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(content);
    messagesList.appendChild(wrapper);

    scrollToBottom();
  }

  function showTypingIndicator() {
    const messagesList = document.getElementById("messagesList");
    const wrapper = document.createElement("div");
    wrapper.className = "message-wrapper bot-message typing-wrapper";
    wrapper.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    const img = document.createElement("img");
    img.src = "logo1.png";
    img.alt = "AI";
    avatar.appendChild(img);

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "typing-bubble";
    bubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;

    content.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(content);
    messagesList.appendChild(wrapper);

    scrollToBottom();
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) {
      indicator.remove();
    }
  }

  async function processCurrentPage() {
    setStatus("loading", "Connecting to page...");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      currentUrl = tab?.url;

      if (!currentUrl || (!currentUrl.startsWith("http://") && !currentUrl.startsWith("https://"))) {
        setStatus("error", "Please open an active HTTP/HTTPS webpage.");
        return;
      }

      setStatus("loading", "Indexing page content...");

      const res = await fetch("http://127.0.0.1:8000/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: currentUrl })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned ${res.status}`);
      }

      const data = await res.json();
      sessionId = data.session_id;

      setStatus("ready", "Ready to chat");
      questionInput.focus();
    } catch (err) {
      console.error(err);
      setStatus("error", err.message === "Failed to fetch" ? "Backend server is not running on :8000" : err.message);
    }
  }

  async function sendMessage(questionText) {
    const question = (questionText || questionInput.value).trim();
    if (!question || isProcessing) return;

    if (!sessionId) {
      alert("Page is not indexed yet. Please wait or retry.");
      return;
    }

    appendUserMessage(question);
    questionInput.value = "";
    questionInput.style.height = "auto";
    sendBtn.disabled = true;

    isProcessing = true;
    showTypingIndicator();

    try {
      const res = await fetch("http://127.0.0.1:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: question,
          session_id: sessionId
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Error from server: ${res.status}`);
      }

      const data = await res.json();
      hideTypingIndicator();
      appendBotMessage(formatContent(data.answer));
    } catch (err) {
      hideTypingIndicator();
      appendBotMessage(`<p style="color: #ef4444;">⚠️ <strong>Error:</strong> ${err.message || "Failed to get response from backend."}</p>`);
    } finally {
      isProcessing = false;
      questionInput.disabled = false;
      questionInput.focus();
    }
  }

  // Auto-resize textarea
  questionInput.addEventListener("input", () => {
    questionInput.style.height = "auto";
    questionInput.style.height = `${Math.min(questionInput.scrollHeight, 90)}px`;
    sendBtn.disabled = questionInput.value.trim().length === 0 || isProcessing || !sessionId;
  });

  // Enter to send (Shift+Enter for newline)
  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendMessage();
      }
    }
  });

  sendBtn.addEventListener("click", () => sendMessage());

  // Suggestion chips handler (delegate from chatBody)
  chatBody.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip && chip.dataset.prompt) {
      sendMessage(chip.dataset.prompt);
    }
  });

  // Clear chat
  clearChatBtn.addEventListener("click", () => {
    const messagesList = document.getElementById("messagesList");
    messagesList.innerHTML = `
      <div class="message-wrapper bot-message">
        <div class="avatar">
          <img src="logo1.png" alt="AI Avatar">
        </div>
        <div class="message-content">
          <div class="bubble">
            <p>👋 Chat cleared! Ask me anything about this webpage.</p>
          </div>
          <div class="suggestion-chips" id="suggestionChips">
            <button class="chip" data-prompt="Summarize this page in 3 key bullet points.">📝 Summarize page</button>
            <button class="chip" data-prompt="What are the key takeaways from this page?">🔑 Key takeaways</button>
            <button class="chip" data-prompt="Explain the main topic of this page in simple terms.">💡 Explain simply</button>
          </div>
        </div>
      </div>
    `;
  });

  retryBtn.addEventListener("click", () => {
    processCurrentPage();
  });

  // Initialize page processing
  processCurrentPage();
});
