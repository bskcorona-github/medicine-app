// Service Worker for おくすりリマインダー

const CACHE_NAME = "medicine-reminder-v2";

// キャッシュするファイル（相対パスに修正）
const urlsToCache = ["./", "./index.html", "./favicon.ico"];

// 通知スケジュールを保存する変数
let notificationSchedules = [];

// 最後の通知時間を記録するオブジェクト
let lastNotificationTimes = {};

// インストール時に実行
self.addEventListener("install", (event) => {
  console.log("Service Worker: インストール中");
  self.skipWaiting(); // すぐにアクティブになる

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: キャッシュを開きました");
        // エラーをキャッチするため個別にキャッシュ
        return Promise.all(
          urlsToCache.map((url) => {
            return fetch(url)
              .then((response) => {
                // 有効なレスポンスのみキャッシュ
                if (!response.ok) {
                  throw new Error(`キャッシュに失敗: ${url}`);
                }
                return cache.put(url, response);
              })
              .catch((error) => {
                console.error(`キャッシュエラー (${url}):`, error);
                // エラーがあっても処理を続行
              });
          })
        );
      })
      .catch((error) => {
        console.error("Service Worker: キャッシュ処理に失敗", error);
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

// Service Workerがアクティブになったらスケジュールと定期チェックを開始
loadSchedulesFromIndexedDB();
setPeriodicNotificationCheck();

// 定期的に通知をチェックする
function setPeriodicNotificationCheck() {
  // 通知スケジュールを1分ごとにチェック
  setInterval(checkScheduledNotifications, 60000);

  // スマホでもバックグラウンドで動作し続けるために、定期的にwakeupイベントを発生させる
  if ("periodicSync" in self.registration) {
    // Periodic Background Sync APIが利用可能な場合
    try {
      self.registration.periodicSync
        .register("notification-sync", {
          minInterval: 60 * 1000, // 最小間隔は1分
        })
        .then(() => {
          console.log("Service Worker: 定期的同期を登録しました");
        });
    } catch (error) {
      console.error("Service Worker: 定期的同期の登録に失敗しました", error);
    }
  } else {
    console.log(
      "Service Worker: 定期的同期APIがサポートされていません、代替手段を使用します"
    );
  }

  // 初回チェック
  checkScheduledNotifications();
}

// 定期的同期イベントのリスナーを追加
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "notification-sync") {
    console.log("Service Worker: 定期的同期イベントを受信");
    event.waitUntil(checkScheduledNotifications());
  }
});

// push通知の購読がなくても定期的にwakeupできるようにする
self.addEventListener("sync", (event) => {
  if (event.tag === "notification-check") {
    console.log("Service Worker: 同期イベントを受信");
    event.waitUntil(checkScheduledNotifications());
  }
});

// IndexedDBから通知スケジュールを読み込む
function loadSchedulesFromIndexedDB() {
  if ("indexedDB" in self) {
    const request = indexedDB.open("medicineReminderDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("notificationSchedules")) {
        db.createObjectStore("notificationSchedules", { keyPath: "id" });
      }
    };

    request.onsuccess = function (event) {
      const db = event.target.result;
      const transaction = db.transaction(["notificationSchedules"], "readonly");
      const store = transaction.objectStore("notificationSchedules");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = function () {
        notificationSchedules = getAllRequest.result || [];
        console.log(
          `Service Worker: ${notificationSchedules.length}件の通知スケジュールを読み込みました`
        );

        // スケジュールを読み込んだ後に通知をチェック
        checkScheduledNotifications();
      };

      getAllRequest.onerror = function (error) {
        console.error("Service Worker: スケジュール読み込みエラー", error);
      };
    };

    request.onerror = function (error) {
      console.error("Service Worker: IndexedDB接続エラー", error);
    };
  }
}

// IndexedDBに通知スケジュールを保存
function saveSchedulesToIndexedDB() {
  if ("indexedDB" in self) {
    const request = indexedDB.open("medicineReminderDB", 1);

    request.onsuccess = function (event) {
      const db = event.target.result;
      const transaction = db.transaction(
        ["notificationSchedules"],
        "readwrite"
      );
      const store = transaction.objectStore("notificationSchedules");

      // 既存のデータを削除
      const clearRequest = store.clear();

      clearRequest.onsuccess = function () {
        // 新しいスケジュールを追加
        notificationSchedules.forEach((schedule) => {
          store.add(schedule);
        });

        console.log(
          `Service Worker: ${notificationSchedules.length}件の通知スケジュールを保存しました`
        );
      };

      clearRequest.onerror = function (error) {
        console.error("Service Worker: スケジュールクリアエラー", error);
      };
    };

    request.onerror = function (error) {
      console.error("Service Worker: IndexedDB接続エラー", error);
    };
  }
}

// スケジュールされた通知をチェックする関数
async function checkScheduledNotifications() {
  if (notificationSchedules.length === 0) {
    console.log("Service Worker: 通知スケジュールがありません");
    return;
  }

  console.log(
    `Service Worker: ${notificationSchedules.length}件の通知スケジュールをチェック中`
  );
  const now = new Date().getTime();
  let updatedSchedules = false;

  for (let i = 0; i < notificationSchedules.length; i++) {
    const schedule = notificationSchedules[i];

    // 通知が届く時間になったかどうか確認
    if (schedule.nextNotification <= now) {
      const medicineId = schedule.id;

      // 同じ薬に対する最後の通知から1分以上経過しているか確認
      const lastNotificationTime = lastNotificationTimes[medicineId] || 0;
      const timePassedSinceLastNotification =
        now - lastNotificationTime >= 60000; // 1分 = 60000ms

      if (timePassedSinceLastNotification) {
        console.log(`Service Worker: ${schedule.name}の通知時間になりました`);

        // 最後の通知時間を更新
        lastNotificationTimes[medicineId] = now;

        // 通知を表示
        await showNotificationForMedicine(schedule);

        // 毎日の通知の場合は、次の日の同じ時間に再スケジュール
        if (schedule.daily) {
          // 時刻を解析
          const [hours, minutes] = schedule.time.split(":").map(Number);
          const nextDate = new Date();
          nextDate.setHours(hours, minutes, 0, 0);

          // 今日の指定時刻がすでに過ぎている場合は明日にスケジュール
          if (nextDate.getTime() < now) {
            nextDate.setDate(nextDate.getDate() + 1);
          }

          schedule.nextNotification = nextDate.getTime();
          updatedSchedules = true;
          console.log(
            `Service Worker: ${schedule.name}の次回通知を${new Date(
              schedule.nextNotification
            ).toLocaleString()}に設定`
          );
        } else {
          // 一度限りの通知の場合は、スケジュールから削除
          notificationSchedules.splice(i, 1);
          i--; // インデックスを調整
          updatedSchedules = true;
          console.log(
            `Service Worker: ${schedule.name}のスケジュールを削除しました`
          );
        }
      } else {
        console.log(
          `Service Worker: ${schedule.name}の通知は最近送信されたため、スキップします`
        );
      }
    }
  }

  // スケジュールが更新された場合は保存
  if (updatedSchedules) {
    saveSchedulesToIndexedDB();
  }
}

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
    vibrate: [200, 100, 200],
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
    self.clients.matchAll().then((clients) => {
      if (clients && clients.length) {
        clients.forEach((client) => {
          client.postMessage({
            type: "DEBUG_RESPONSE",
            message:
              "デバッグテスト通知　service workerが正常に動作しています。",
            time: new Date().toISOString(),
          });
        });
      }
    });

    // テスト通知を表示
    self.registration.showNotification("デバッグテスト通知", {
      body: "service workerが正常に動作しています。",
      icon: "/favicon.ico",
      tag: "debug-test",
    });
  }

  // スケジュールされた通知を処理
  if (event.data && event.data.type === "SCHEDULE_NOTIFICATION") {
    console.log("Service Worker: スケジュール通知を受信", event.data);

    const medicine = event.data.medicine || {
      id: "unknown",
      name: "お薬",
      tag: "medicine-unknown",
    };

    // 通知を表示
    self.registration
      .showNotification("お薬の時間です", {
        body: `${medicine.name}を服用する時間です`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        vibrate: [200, 100, 200],
        tag: medicine.tag || `medicine-${medicine.id}`,
        requireInteraction: true,
        renotify: true,
        silent: false,
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
      })
      .then(() => {
        console.log("Service Worker: スケジュール通知を表示しました");

        // 音声を再生するためにクライアントを起こす
        return self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
      })
      .then((clients) => {
        if (clients.length === 0) {
          // クライアントがなければ、バックグラウンドで音声を再生するためのメッセージを送信
          const url =
            self.registration.scope + `?notification=sound&id=${medicine.id}`;
          console.log(
            "Service Worker: 通知のためにクライアントを起動します",
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
        console.error(
          "Service Worker: 通知表示中にエラーが発生しました",
          error
        );
      });
  }

  // 長期通知スケジュールを登録
  if (event.data && event.data.type === "REGISTER_NOTIFICATION_SCHEDULE") {
    console.log("Service Worker: 通知スケジュール登録を受信", event.data);

    if (event.data.medicine) {
      const medicine = event.data.medicine;

      // 既存のスケジュールを確認
      const existingIndex = notificationSchedules.findIndex(
        (s) => s.id === medicine.id
      );

      if (existingIndex >= 0) {
        // 既存のスケジュールを更新
        notificationSchedules[existingIndex] = medicine;
      } else {
        // 新しいスケジュールを追加
        notificationSchedules.push(medicine);
      }

      // IndexedDBに保存
      saveSchedulesToIndexedDB();

      console.log(
        `Service Worker: 通知スケジュールを登録しました - ${
          medicine.name
        } (次回: ${new Date(medicine.nextNotification).toLocaleString()})`
      );
    }
  }

  // 通知スケジュールをチェック（クライアントからの定期的な呼び出し）
  if (event.data && event.data.type === "CHECK_NOTIFICATION_SCHEDULES") {
    console.log("Service Worker: 通知スケジュールチェックリクエストを受信");
    checkScheduledNotifications();
  }
});

// 薬の通知を表示する関数
async function showNotificationForMedicine(schedule) {
  try {
    // 通知を表示
    await self.registration.showNotification("お薬の時間です", {
      body: `${schedule.name}を服用する時間です`,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      vibrate: [200, 100, 200],
      tag: `medicine-${schedule.id}`,
      requireInteraction: true,
      renotify: true,
      silent: false,
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
    });

    console.log(`Service Worker: ${schedule.name}の通知を表示しました`);

    // スマホで閉じている場合はアプリを起動する試み
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    // クライアントが存在しない場合（アプリが閉じている場合）
    if (clients.length === 0) {
      console.log(
        "Service Worker: クライアントが見つかりません、新しいウィンドウを開きます"
      );
      // アプリを起動する試み
      return self.clients.openWindow(
        `${self.registration.scope}?notification=medicine&id=${schedule.id}`
      );
    }
  } catch (error) {
    console.error(
      `Service Worker: ${schedule.name}の通知表示に失敗しました`,
      error
    );
  }
}
