(function () {
  const unlockBtn = document.getElementById("unlock");
  const adminUi = document.getElementById("admin-ui");
  const access = document.getElementById("access");
  const codeInput = document.getElementById("admin-code");

  unlockBtn.addEventListener("click", () => {
    const code = codeInput.value.trim();
    if (!code) return alert("Enter the secret code.");

    // Basic client-side gate: only reveal UI if code provided.
    access.style.display = "none";
    adminUi.style.display = "block";

    const sendBtn = document.getElementById("send-notif");
    sendBtn.addEventListener("click", async () => {
      const title = document.getElementById("notif-title").value.trim();
      const message = document.getElementById("notif-message").value.trim();
      if (!message) return alert("Message required");

      try {
        const res = await fetch(`/${encodeURIComponent(code)}/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, message }),
        });

        const txt = await res.text().catch(()=>null);
        if (!res.ok) {
          throw new Error(txt || res.statusText);
        }

        alert("Notification queued/sent.");
        console.log('notify response:', txt);
      } catch (err) {
        console.error(err);
        alert("Failed to send notification: " + err.message);
      }
    });
  });
})();
