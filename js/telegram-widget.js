/* Fundly — floating Telegram support button, injected on every
   customer-facing page. Single source so the link/label only needs
   updating in one place. */
(function () {
  const a = document.createElement("a");
  a.href = "https://t.me/+420608187811";
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "tg-float";
  a.setAttribute("aria-label", "Chat with support on Telegram");
  a.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <path d="M187.6 63.2 159 191.8c-2.2 9.7-7.9 12.1-16 7.5l-44.2-32.6-21.3 20.5c-2.4 2.4-4.3 4.3-8.8 4.3l3.1-44.9L152 68.6c3.8-3.4-.8-5.3-5.9-1.9L67 118.8l-43.4-13.6c-9.4-2.9-9.6-9.4 2-13.9l169.8-65.5c7.9-2.9 14.7 1.9 12.2 14.4Z" fill="currentColor"/>
    </svg>
    <span class="tg-float-label">Support</span>`;
  document.body.appendChild(a);
})();
