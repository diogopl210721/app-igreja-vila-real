// Service worker do app da igreja — cuida das notificações push
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = { titulo: "Nova notificação", texto: event.data ? event.data.text() : "" }; }

  const titulo = dados.titulo || "IEQ Vila Real";
  const opcoes = {
    body: dados.texto || "",
    icon: dados.icone || "assets/logo.png",
    badge: "assets/logo.png",
    data: { url: dados.url || "./" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
