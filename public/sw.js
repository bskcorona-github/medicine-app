// Service Worker for おくすりリマインダー

const CACHE_NAME = "medicine-reminder-v1";

// キャッシュするファイル
const urlsToCache = [
  "/",
  "/index.html",
  "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav",
  "/favicon.ico",
];

// インストール時に実行
self.addEventListener("install", (event) => {
  console.log("Service Worker: インストール中");
  self.skipWaiting(); // すぐにアクティブになる

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: キャッシュを開きました");
      return cache.addAll(urlsToCache);
    })
  );
});

// アクティベート時に実行
self.addEventListener("activate", (event) => {
  console.log("Service Worker: アクティブ化");

  // すぐにコントロールを取得
  event.waitUntil(clients.claim());

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== CACHE_NAME;
          })
          .map((cacheName) => {
            console.log("Service Worker: 古いキャッシュを削除中", cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
});

// フェッチ時に実行（キャッシュがあればそれを返す）
self.addEventListener("fetch", (event) => {
  // navigationリクエストかどうかをチェック
  if (event.request.mode === "navigate") {
    console.log("Service Worker: ナビゲーションリクエスト", event.request.url);
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        if (response) {
          console.log(
            "Service Worker: キャッシュからレスポンス",
            event.request.url
          );
          return response;
        }
        console.log(
          "Service Worker: ネットワークからフェッチ",
          event.request.url
        );
        return fetch(event.request);
      })
      .catch((error) => {
        console.error("Service Worker: フェッチエラー", error);
        // ネットワークエラーの場合、オフラインページを返すこともできる
      })
  );
});

// プッシュ通知を受け取ったときの処理
self.addEventListener("push", (event) => {
  console.log("Service Worker: プッシュ通知を受信");

  let notificationData = {};

  try {
    if (event.data) {
      notificationData = event.data.json();
      console.log("Service Worker: 通知データ", notificationData);
    }
  } catch (error) {
    // エラー詳細をログに出力
    console.error("Service Worker: 通知データの解析に失敗", error);
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
    silent: false, // サウンドを再生
    renotify: true, // 同じタグでも再通知
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

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => {
        console.log("Service Worker: 通知を表示しました");
        // 音声を再生するためにクライアントを起こす
        return self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
      })
      .then((clients) => {
        if (clients.length === 0) {
          // クライアントがなければ、バックグラウンドで音声を再生するためのメッセージを送信
          return self.clients.openWindow("/?notification=sound");
        }

        // クライアントがある場合はメッセージを送信
        clients.forEach((client) => {
          client.postMessage({
            type: "PLAY_NOTIFICATION_SOUND",
            medicineId: notificationData.medicineId || "",
          });
        });
      })
  );
});

// 通知のクリック時の処理
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: 通知がクリックされました");

  const notification = event.notification;
  const action = event.action;

  // 通知を閉じる
  notification.close();

  // アクションの解析
  const tag = notification.tag || "";
  let medicineId = "";

  // medicine-{id} または medicine-reminder-{id} から id を抽出
  if (tag.startsWith("medicine-")) {
    medicineId = tag.replace("medicine-", "").replace("reminder-", "");
  }

  // アクションによって異なる処理
  if (action === "taken") {
    // 服用済みのアクションを実行
    console.log("Service Worker: 服用済みアクション", medicineId);

    event.waitUntil(clients.openWindow(`/?action=taken&id=${medicineId}`));
  } else {
    // 通知をクリックした場合やその他のアクション
    console.log("Service Worker: 通常クリック");

    event.waitUntil(
      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((clientList) => {
          // すでにウィンドウが開いていれば、そこにフォーカス
          for (const client of clientList) {
            if ("focus" in client) {
              console.log("Service Worker: 既存のウィンドウにフォーカス");
              return client.focus();
            }
          }
          // ウィンドウが開いていなければ新しく開く
          if (clients.openWindow) {
            console.log("Service Worker: 新しいウィンドウを開く");
            return clients.openWindow("/");
          }
        })
    );
  }
});

// メッセージ受信時の処理
self.addEventListener("message", (event) => {
  console.log("Service Worker: メッセージを受信", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
