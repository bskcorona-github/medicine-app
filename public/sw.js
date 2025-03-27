// Service Worker for おくすりリマインダー

const CACHE_NAME = "medicine-reminder-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav",
  "/favicon.ico",
];

// インストール時に実行
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("キャッシュを開きました");
      return cache.addAll(urlsToCache);
    })
  );
});

// アクティベート時に実行
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME;
          })
          .map((cacheName) => {
            return caches.delete(cacheName);
          })
      );
    })
  );
});

// フェッチ時に実行（キャッシュがあればそれを返す）
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});

// プッシュ通知を受け取ったときの処理
self.addEventListener("push", (event) => {
  let notificationData = {};

  try {
    if (event.data) {
      notificationData = event.data.json();
    }
  } catch (_) {
    notificationData = {
      title: "お薬の時間です",
      message: "お薬を飲む時間になりました",
    };
  }

  const title = notificationData.title || "お薬の時間です";
  const options = {
    body: notificationData.message || "お薬を飲む時間になりました",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    vibrate: [200, 100, 200, 100, 200],
    tag: notificationData.tag || "medicine-reminder",
    requireInteraction: true, // ユーザーが操作するまで通知を表示し続ける
    actions: [
      {
        action: "taken",
        title: "服用しました",
      },
      {
        action: "later",
        title: "後で",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知のクリック時の処理
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action;

  // 通知を閉じる
  notification.close();

  // アクションによって異なる処理
  if (action === "taken") {
    // 服用済みのアクションを実行
    clients.openWindow("/?action=taken&id=" + (notification.tag || ""));
  } else {
    // 通知をクリックした場合やその他のアクション
    event.waitUntil(
      clients
        .matchAll({
          type: "window",
        })
        .then((clientList) => {
          // すでにウィンドウが開いていれば、そこにフォーカス
          for (const client of clientList) {
            if ("focus" in client) {
              return client.focus();
            }
          }
          // ウィンドウが開いていなければ新しく開く
          if (clients.openWindow) {
            return clients.openWindow("/");
          }
        })
    );
  }
});
