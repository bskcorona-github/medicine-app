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
          // スマホでも確実に起動するために、絶対URLを使用
          const url = self.registration.scope + "?notification=sound";
          console.log("Service Worker: クライアントを起動します", url);
          return self.clients.openWindow(url);
        }

        // クライアントがある場合はメッセージを送信
        clients.forEach((client) => {
          client.postMessage({
            type: "PLAY_NOTIFICATION_SOUND",
            medicineId: notificationData.medicineId || "",
          });
        });
      })
      .catch((error) => {
        console.error(
          "Service Worker: 通知処理中にエラーが発生しました",
          error
        );
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

    // 絶対URLを使用して確実にアプリを開く
    const url = self.registration.scope + `?action=taken&id=${medicineId}`;
    console.log("Service Worker: アプリを開きます", url);
    event.waitUntil(clients.openWindow(url));
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
            const url = self.registration.scope;
            return clients.openWindow(url);
          }
        })
        .catch((error) => {
          console.error(
            "Service Worker: 通知クリック処理中にエラーが発生しました",
            error
          );
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

  // デバッグテストメッセージを処理
  if (event.data && event.data.type === "DEBUG_TEST") {
    console.log("Service Worker: デバッグテストメッセージを受信", event.data);

    // 応答を送信
    if (event.source) {
      event.source.postMessage({
        type: "DEBUG_RESPONSE",
        time: new Date().toISOString(),
        status: "OK",
        serviceWorkerState: self.registration ? "登録済み" : "未登録",
      });
      console.log("Service Worker: デバッグ応答を送信しました");
    }

    // 5秒後にテスト通知を送信（デバッグ用）
    setTimeout(() => {
      self.registration
        .showNotification("デバッグテスト通知", {
          body: "Service Workerが正常に動作しています",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          vibrate: [200, 100, 200],
          tag: "debug-test",
          requireInteraction: true,
          actions: [
            {
              action: "test",
              title: "テスト",
            },
          ],
        })
        .then(() => console.log("Service Worker: デバッグテスト通知を表示"))
        .catch((error) =>
          console.error("Service Worker: デバッグテスト通知に失敗", error)
        );
    }, 5000);
  }

  // スケジュールされた通知を処理
  if (event.data && event.data.type === "SCHEDULE_NOTIFICATION") {
    console.log("Service Worker: スケジュールされた通知を処理", event.data);

    const medicine = event.data.medicine;
    if (!medicine) {
      console.error("Service Worker: 通知データが不完全です");
      return;
    }

    // 通知を表示
    const title = "お薬の時間です";
    const options = {
      body: `${medicine.name}を服用する時間です`,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      vibrate: [200, 100, 200, 100, 200],
      tag: medicine.tag || `medicine-${medicine.id}`,
      requireInteraction: true,
      silent: false,
      renotify: true,
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

    self.registration
      .showNotification(title, options)
      .then(() => {
        console.log("Service Worker: スケジュールされた通知を表示しました");
        // クライアントに音声再生メッセージを送信
        return self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
      })
      .then((clients) => {
        if (clients.length === 0) {
          // クライアントがなければ新しいウィンドウを開く
          const url = self.registration.scope + "?notification=sound";
          console.log(
            "Service Worker: スケジュール通知 - クライアントを起動します",
            url
          );
          return self.clients.openWindow(url);
        }

        // クライアントがある場合はメッセージを送信
        clients.forEach((client) => {
          client.postMessage({
            type: "PLAY_NOTIFICATION_SOUND",
            medicineId: medicine.id || "",
          });
        });
      })
      .catch((error) => {
        console.error("Service Worker: スケジュール通知の表示に失敗", error);
      });
  }
});
