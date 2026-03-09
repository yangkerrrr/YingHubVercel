/**
 * YingHub Notification System
 * Connects to the notification server and displays notifications
 */

class NotificationClient {
  constructor() {
    this.eventSource = null;
    this.notifications = new Map();
    this.container = null;
    this.SECRET_PATH = "yinghub_secret_notifications_path_12345"; // Must match server
    this.isConnected = false;
  }

  /**
   * Initialize the notification system
   */
  init() {
    this.createContainer();
    this.connect();
    // Request permission for system notifications
    if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      try {
        Notification.requestPermission().then(() => {});
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Create the notification display container
   */
  createContainer() {
    if (document.getElementById("notification-container")) {
      this.container = document.getElementById("notification-container");
      return;
    }

    this.container = document.createElement("div");
    this.container.id = "notification-container";
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(this.container);

    this.addStyles();
  }

  /**
   * Add CSS styles for notifications
   */
  addStyles() {
    if (document.getElementById("notification-styles")) return;

    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 16px;
        margin-bottom: 12px;
        min-width: 300px;
        max-width: 400px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        animation: slideIn 0.3s ease-out;
      }

      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOut {
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }

      .notification.removing {
        animation: slideOut 0.3s ease-in;
      }

      .notification.info {
        border-left: 4px solid #3b82f6;
      }

      .notification.success {
        border-left: 4px solid #10b981;
      }

      .notification.warning {
        border-left: 4px solid #f59e0b;
      }

      .notification.error {
        border-left: 4px solid #ef4444;
      }

      .notification-icon {
        font-size: 20px;
        flex-shrink: 0;
        line-height: 1.4;
      }

      .notification-content {
        flex: 1;
      }

      .notification-title {
        font-weight: 600;
        font-size: 14px;
        margin: 0 0 4px 0;
        color: #111;
      }

      .notification-message {
        font-size: 14px;
        color: #666;
        margin: 0;
      }

      .notification-close {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
      }

      .notification-close:hover {
        color: #333;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Connect to the server's notification stream
   */
  connect() {
    const url = `/${this.SECRET_PATH}/subscribe`;

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log("Connected to notification server");
      this.isConnected = true;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log("Notification client connected");
        } else if (data.type === "cleared") {
          this.clearAllNotifications();
        } else if (data.id) {
          this.showNotification(data);
          this.showSystemNotification(data);
        }
      } catch (error) {
        console.error("Error parsing notification:", error);
      }
    };

    this.eventSource.onerror = () => {
      console.warn("Notification connection error, attempting reconnect...");
      this.isConnected = false;
      this.eventSource.close();
      setTimeout(() => this.connect(), 3000);
    };
  }

  /**
   * Show native/system notification when possible
   */
  showSystemNotification(notification) {
    const { title, message, icon } = notification;

    if (!('Notification' in window)) return;

    const tryShow = () => {
      // Use service worker registration if available (better for background)
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg && reg.showNotification) {
            try {
              reg.showNotification(title || 'Notification', { body: message || '', icon });
            } catch (e) {
              // fallback
              try { new Notification(title || 'Notification', { body: message || '', icon }); } catch (err) {}
            }
          } else {
            try { new Notification(title || 'Notification', { body: message || '', icon }); } catch (err) {}
          }
        }).catch(() => {
          try { new Notification(title || 'Notification', { body: message || '', icon }); } catch (err) {}
        });
      } else {
        try { new Notification(title || 'Notification', { body: message || '', icon }); } catch (err) {}
      }
    };

    if (Notification.permission === 'granted') {
      tryShow();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') tryShow();
      }).catch(() => {});
    }
  }

  /**
   * Display a notification
   */
  showNotification(notification) {
    const { id, title, message, type, icon } = notification;

    const notifEl = document.createElement("div");
    notifEl.className = `notification ${type}`;
    notifEl.id = `notif-${id}`;

    const iconEmoji = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
    }[type] || "📢";

    notifEl.innerHTML = `
      <div class="notification-icon">${icon || iconEmoji}</div>
      <div class="notification-content">
        <p class="notification-title">${this.escapeHtml(title)}</p>
        <p class="notification-message">${this.escapeHtml(message)}</p>
      </div>
      <button class="notification-close" type="button">×</button>
    `;

    const closeBtn = notifEl.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => this.removeNotification(id));

    this.container.appendChild(notifEl);
    this.notifications.set(id, notifEl);

    // Auto-remove after 5 seconds
    setTimeout(() => this.removeNotification(id), 5000);
  }

  /**
   * Remove a notification
   */
  removeNotification(id) {
    const notifEl = this.notifications.get(id);
    if (!notifEl) return;

    notifEl.classList.add("removing");
    setTimeout(() => {
      notifEl.remove();
      this.notifications.delete(id);
    }, 300);
  }

  /**
   * Clear all notifications
   */
  clearAllNotifications() {
    this.notifications.forEach((notifEl) => {
      notifEl.remove();
    });
    this.notifications.clear();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.isConnected = false;
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.notificationClient = new NotificationClient();
    window.notificationClient.init();
  });
} else {
  window.notificationClient = new NotificationClient();
  window.notificationClient.init();
}
