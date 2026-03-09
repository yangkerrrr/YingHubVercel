/* Simple push service worker to display notifications */
self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Notification", body: event.data && event.data.text ? event.data.text() : "You have a new message" };
  }

  const title = data.title || "Notification";
  const options = {
    body: data.body || data.message || "",
    icon: data.icon || "/media/icons/icon-192.png",
    data: data,
  };

  try {
    console.log('push event received in service worker, payload:', data);
  } catch (e) {}

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
