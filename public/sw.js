// Service Worker for おくすりリマインダー

// キャッシュバージョンを更新（新しいSWを確実に適用するため）
const CACHE_NAME = "medicine-reminder-v3";
const SW_VERSION = "1.0.2"; // 明示的なバージョン管理

// 音声ファイルのパス（アプリ全体で統一）
const SOUND_FILE_PATH = "/sounds/001_zundamon_okusuri.wav";

// キャッシュするファイル（相対パスに修正）
const urlsToCache = [
  "/",
  "/icon/favicon.ico",
  "/icon/android-chrome-192x192.png",
  "/icon/android-chrome-512x512.png",
  "/icon/apple-icon.png",
  SOUND_FILE_PATH,
];

// 通知スケジュールを保存する変数
let notificationSchedules = [];

// 最後の通知時間を記録するオブジェクト
let lastNotificationTimes = {};

// グローバル通知デバウンス管理（タイプごとに管理）
let lastGlobalNotifications = {
  sound: 0, // 音声再生
  notification: 0, // システム通知
  message: 0, // クライアントへのメッセージ送信
};

// favicon.icoのキャッシュ状態を追跡
let faviconCached = false;

// グローバルな通知デバウンス値
const NOTIFICATION_DEBOUNCE_MS = 5000; // 5秒 - グローバル通知間隔
const SOUND_DEBOUNCE_MS = 3000; // 3秒 - 音声再生間隔
const MESSAGE_DEBOUNCE_MS = 2000; // 2秒 - メッセージ送信間隔
const NOTIFICATION_MIN_INTERVAL = 3000; // 3秒 - 同一薬の通知間隔

// インストール時に実行
self.addEventListener("install", (event) => {
  console.log(`Service Worker v${SW_VERSION}: インストール中`);
  self.skipWaiting(); // すぐにアクティブになる

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log(`Service Worker v${SW_VERSION}: キャッシュを開きました`);

        // 音声ファイルを優先的にキャッシュ
        return fetch(SOUND_FILE_PATH, { cache: "no-store" })
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `音声ファイルのキャッシュに失敗: ${SOUND_FILE_PATH}`
              );
            }
            console.log(
              `Service Worker v${SW_VERSION}: 音声ファイル ${SOUND_FILE_PATH} をキャッシュしました`
            );
            return cache.put(SOUND_FILE_PATH, response.clone());
          })
          .catch((error) => {
            console.error(
              `Service Worker v${SW_VERSION}: 音声ファイルのキャッシュエラー: ${error}`
            );
          })
          .then(() => {
            // その他の静的ファイルをキャッシュ
            return Promise.all(
              urlsToCache.map((url) => {
                // 音声ファイルは既にキャッシュ済みなのでスキップ
                if (url === SOUND_FILE_PATH) return Promise.resolve();

                // ルートパスの場合は特別な処理
                if (url === "/") {
                  console.log(
                    "ルートパスはNext.jsが処理するためスキップします"
                  );
                  return Promise.resolve();
                }

                return fetch(url, { cache: "no-store" })
                  .then((response) => {
                    if (!response.ok) {
                      throw new Error(`キャッシュに失敗: ${url}`);
                    }
                    return cache.put(url, response);
                  })
                  .catch((error) => {
                    // エラーをログに記録するが、処理は続行
                    console.warn(`キャッシュスキップ (${url}):`, error);
                  });
              })
            );
          });
      })
      .catch((error) => {
        console.error(
          `Service Worker v${SW_VERSION}: キャッシュ処理に失敗`,
          error
        );
      })
  );
});

// アクティベート時に実行
self.addEventListener("activate", (event) => {
  console.log(`Service Worker v${SW_VERSION}: アクティブ化`);

  // すぐにコントロールを取得
  event.waitUntil(
    Promise.all([
      // 以前のクライアントを制御
      clients.claim(),

      // 古いキャッシュを削除
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log(
                `Service Worker v${SW_VERSION}: 古いキャッシュを削除中`,
                cacheName
              );
              return caches.delete(cacheName);
            })
        );
      }),

      // スケジュールをロード
      loadSchedulesFromIndexedDB(),

      // 通知をすぐにチェック
      checkScheduledNotifications(),
    ])
  );

  // 定期的な通知チェックを開始
  setPeriodicNotificationCheck();

  // バージョン情報をクライアントに通知
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "SW_VERSION_INFO",
        version: SW_VERSION,
        cache: CACHE_NAME,
        time: new Date().toISOString(),
      });
    });
  });
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
  if (
    event.tag === "notification-sync" ||
    event.tag === "notification-hourly-sync"
  ) {
    console.log(`Service Worker: 定期的同期イベントを受信 (${event.tag})`);
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

// IndexedDBからスケジュールを読み込む際に重複を削除する
function removeDuplicateSchedules(schedules) {
  // IDとtime（時間）の組み合わせでユニークにする
  const uniqueSchedules = [];
  const seen = new Set();

  schedules.forEach((schedule) => {
    const key = `${schedule.id}-${schedule.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSchedules.push(schedule);
    }
  });

  return uniqueSchedules;
}

// IndexedDBから通知スケジュールを読み込む
function loadSchedulesFromIndexedDB() {
  return new Promise((resolve, reject) => {
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
        const transaction = db.transaction(
          ["notificationSchedules"],
          "readonly"
        );
        const store = transaction.objectStore("notificationSchedules");
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = function () {
          const loadedSchedules = getAllRequest.result || [];
          // 重複を削除
          notificationSchedules = removeDuplicateSchedules(loadedSchedules);

          if (notificationSchedules.length !== loadedSchedules.length) {
            console.log(
              `Service Worker: 重複を${
                loadedSchedules.length - notificationSchedules.length
              }件削除しました`
            );
            // 重複が削除された場合は保存し直す
            saveSchedulesToIndexedDB();
          }

          console.log(
            `Service Worker: ${notificationSchedules.length}件の通知スケジュールを読み込みました`
          );

          resolve(notificationSchedules);
        };

        getAllRequest.onerror = function (error) {
          console.error("Service Worker: スケジュール読み込みエラー", error);
          reject(error);
        };
      };

      request.onerror = function (error) {
        console.error("Service Worker: IndexedDB接続エラー", error);
        reject(error);
      };
    } else {
      resolve([]); // IndexedDBが利用できない場合は空の配列を返す
    }
  });
}

// IndexedDBに通知スケジュールを保存する前に重複を削除
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
        // 重複を削除してから保存
        const uniqueSchedules = removeDuplicateSchedules(notificationSchedules);
        notificationSchedules = uniqueSchedules;

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

// バックグラウンドで音声を再生する関数（サービスワーカーからクライアントに依頼）
function playNotificationSoundOnClients() {
  const now = Date.now();

  // メッセージ送信の最小間隔を設定
  const soundMessageDebounceDuration = MESSAGE_DEBOUNCE_MS; // メッセージ送信デバウンス

  // 最後の音声通知から一定時間経過していない場合はスキップ
  if (now - (lastGlobalNotifications.sound || 0) < SOUND_DEBOUNCE_MS) {
    console.log(
      `Service Worker: 最後の音声通知から${
        (now - (lastGlobalNotifications.sound || 0)) / 1000
      }秒しか経過していないため、音声をスキップします`
    );
    return Promise.resolve(false);
  }

  // 最後のメッセージ送信から一定時間経過していない場合もスキップ
  if (
    now - (lastGlobalNotifications.message || 0) <
    soundMessageDebounceDuration
  ) {
    console.log(
      `Service Worker: 最後のメッセージ送信から${
        (now - (lastGlobalNotifications.message || 0)) / 1000
      }秒しか経過していないため、音声メッセージをスキップします`
    );
    return Promise.resolve(false);
  }

  // 時間を更新
  lastGlobalNotifications.sound = now;
  lastGlobalNotifications.message = now;

  return self.clients
    .matchAll({
      type: "window",
      includeUncontrolled: true,
    })
    .then((clients) => {
      if (clients.length === 0) {
        console.log(
          "Service Worker: クライアントが見つかりません、新しいウィンドウを開きます"
        );
        // クライアントがなければ新しいウィンドウを開く
        const url = `${self.registration.scope}?notification=sound&time=${now}`;
        return self.clients
          .openWindow(url)
          .then(() => {
            console.log(
              "Service Worker: 音声再生のためにクライアントを起動しました"
            );
            return true;
          })
          .catch((error) => {
            console.error("Service Worker: クライアント起動エラー:", error);
            return false;
          });
      } else {
        // アクティブなクライアントがある場合はメッセージを送信
        let messageSent = false;

        // すべてのクライアントに対してメッセージを送信（最初の1つが成功すれば十分）
        const messagePromises = clients.map((client) =>
          client
            .postMessage({
              type: "PLAY_NOTIFICATION_SOUND",
              time: now,
            })
            .then(() => {
              if (!messageSent) {
                messageSent = true;
                console.log(
                  `Service Worker: 音声再生メッセージをクライアントに送信しました (${client.id})`
                );
              }
              return true;
            })
            .catch((error) => {
              console.error(
                `Service Worker: クライアント${client.id}へのメッセージ送信エラー:`,
                error
              );
              return false;
            })
        );

        return Promise.all(messagePromises).then((results) =>
          results.some((result) => result)
        );
      }
    })
    .catch((error) => {
      console.error("Service Worker: クライアント検索エラー:", error);
      return false;
    });
}

// 音声ファイルのキャッシュを確認し、必要に応じて更新する
function ensureSoundFileCached() {
  return caches
    .open(CACHE_NAME)
    .then((cache) => {
      return cache.match(SOUND_FILE_PATH).then((response) => {
        if (response) {
          console.log(`Service Worker: 音声ファイルはキャッシュ済みです`);
          return response;
        }

        console.log(`Service Worker: 音声ファイルをキャッシュしています...`);
        return fetch(SOUND_FILE_PATH, { cache: "no-store" }).then(
          (fetchResponse) => {
            if (!fetchResponse.ok) {
              throw new Error(
                `音声ファイルの取得に失敗: ${fetchResponse.status}`
              );
            }

            // キャッシュに保存
            cache.put(SOUND_FILE_PATH, fetchResponse.clone());
            console.log(`Service Worker: 音声ファイルをキャッシュしました`);

            return fetchResponse;
          }
        );
      });
    })
    .catch((error) => {
      console.error(`Service Worker: 音声ファイルのキャッシュエラー:`, error);
      return null;
    });
}

// フェッチ時に実行（キャッシュがあればそれを返す）
self.addEventListener("fetch", (event) => {
  // faviconリクエストの無限ループを防止
  if (event.request.url.includes("favicon.ico")) {
    // すでにキャッシュ済みの場合は単純に処理
    if (faviconCached) {
      event.respondWith(
        caches.match(event.request).then((response) => {
          return response || fetch(event.request, { cache: "force-cache" });
        })
      );
      return;
    }

    // まだキャッシュされていない場合は一度だけキャッシュ
    event.respondWith(
      caches.match(event.request).then((response) => {
        // キャッシュが見つかった場合はそれを返す
        if (response) {
          faviconCached = true;
          return response;
        }

        // キャッシュが見つからない場合は1回だけネットワークからフェッチ
        return fetch(event.request, { cache: "force-cache" }).then(
          (fetchResponse) => {
            // レスポンスをキャッシュに保存
            if (fetchResponse.ok) {
              const responseToCache = fetchResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
                faviconCached = true;
              });
            }
            return fetchResponse;
          }
        );
      })
    );
    return;
  }

  // 音声ファイルのリクエストを特別に処理
  if (event.request.url.includes(SOUND_FILE_PATH)) {
    event.respondWith(
      caches.match(SOUND_FILE_PATH).then((response) => {
        if (response) {
          console.log("Service Worker: 音声ファイルをキャッシュから提供");
          return response;
        }

        console.log("Service Worker: 音声ファイルをネットワークから取得");
        return fetch(event.request, { cache: "no-store" })
          .then((fetchResponse) => {
            if (!fetchResponse.ok) {
              throw new Error(
                `音声ファイルの取得に失敗: ${fetchResponse.status}`
              );
            }

            // キャッシュを更新
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(SOUND_FILE_PATH, responseToCache);
              console.log(
                "Service Worker: 音声ファイルを新たにキャッシュしました"
              );
            });

            return fetchResponse;
          })
          .catch((error) => {
            console.error("Service Worker: 音声ファイル取得エラー:", error);
            throw error;
          });
      })
    );
    return;
  }

  // Next.jsのダイナミックルーティングを考慮したフェッチ処理
  event.respondWith(
    caches.match(event.request).then((response) => {
      // キャッシュがある場合はそれを返す
      if (response) {
        return response;
      }

      // キャッシュがない場合はネットワークにフェッチ
      return fetch(event.request).then((response) => {
        // 404エラーの場合はNext.jsのデフォルトエラーページを返す
        if (!response.ok && response.status === 404) {
          return response;
        }

        // 静的アセットの場合のみキャッシュを試みる
        if (
          response.ok &&
          (event.request.url.includes("/icon/") ||
            event.request.url.includes("/sounds/"))
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      });
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
    icon: "/icon/favicon.ico",
    badge: "/icon/favicon.ico",
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

// メッセージ受信時の処理を修正
self.addEventListener("message", async (event) => {
  console.log("Service Worker: メッセージを受信", event.data);

  // デバッグ用メッセージの場合
  if (event.data && event.data.type === "DEBUG_TEST") {
    console.log(
      "Service Worker: デバッグテストメッセージを受信",
      event.data.time
    );

    // キャッシュ状態を確認して応答
    const soundResponse = await ensureSoundFileCached();
    event.source.postMessage({
      type: "DEBUG_RESPONSE",
      message: "デバッグテストを受け取りました",
      time: new Date().toISOString(),
      soundCached: !!soundResponse,
      swVersion: SW_VERSION,
      schedules: notificationSchedules.length,
    });
    return;
  }

  // 通知スケジュールのチェックリクエスト
  if (event.data && event.data.type === "CHECK_NOTIFICATION_SCHEDULES") {
    console.log("Service Worker: 通知スケジュールのチェックリクエスト");

    try {
      // スケジュールをロードして確認
      await loadSchedulesFromIndexedDB();
      const notificationShown = await checkScheduledNotifications();

      if (event.source) {
        event.source.postMessage({
          type: "NOTIFICATION_CHECK_RESULT",
          time: new Date().toISOString(),
          notificationShown: notificationShown,
          scheduleCount: notificationSchedules.length,
        });
      }
    } catch (error) {
      console.error("Service Worker: 通知チェック中にエラー:", error);
    }
    return;
  }

  if (event.data && event.data.type === "SCHEDULE_NOTIFICATION") {
    console.log(
      "Service Worker: 通知スケジュールリクエスト",
      event.data.medicine
    );
    showNotification(event.data.medicine);
  } else if (
    event.data &&
    event.data.type === "REGISTER_NOTIFICATION_SCHEDULE"
  ) {
    console.log(
      "Service Worker: 通知スケジュール登録リクエスト",
      event.data.medicine
    );
    registerNotificationSchedule(event.data.medicine);
  } else if (event.data && event.data.type === "REMOVE_NOTIFICATION_SCHEDULE") {
    console.log(
      "Service Worker: 通知スケジュール削除リクエスト",
      event.data.medicineId
    );
    removeNotificationSchedule(event.data.medicineId);
  } else if (
    event.data &&
    event.data.type === "REMOVE_ALL_NOTIFICATION_SCHEDULES"
  ) {
    console.log("Service Worker: すべての通知スケジュール削除リクエスト");
    removeAllNotificationSchedules();
  }
});

// 通知を表示する関数
function showNotification(medicine) {
  if (!medicine) {
    console.error("Service Worker: 通知データが不足しています");
    return;
  }

  const now = Date.now();

  // グローバルな通知デバウンスを確認
  const lastGlobalNotification = lastGlobalNotifications.notification || 0;
  if (now - lastGlobalNotification < NOTIFICATION_DEBOUNCE_MS) {
    console.log(
      `Service Worker: 最後の通知から${
        (now - lastGlobalNotification) / 1000
      }秒しか経過していないため、通知をスキップします`
    );
    return;
  }

  // 特定の薬の最後の通知時間も確認
  const lastNotificationTime = lastNotificationTimes[medicine.id] || 0;
  if (now - lastNotificationTime < NOTIFICATION_MIN_INTERVAL) {
    console.log(
      `Service Worker: ${medicine.name}の通知は最近表示されたため、スキップします`
    );
    return;
  }

  // 最後の通知時間を更新
  lastNotificationTimes[medicine.id] = now;
  lastGlobalNotifications.notification = now;

  // 通知を表示
  self.registration
    .showNotification("お薬の時間です", {
      body: `${medicine.name}を服用する時間です`,
      icon: "/icon/favicon.ico",
      badge: "/icon/favicon.ico",
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
      data: {
        medicineId: medicine.id,
        name: medicine.name,
        timeStamp: new Date().toISOString(),
      },
    })
    .then(() => {
      console.log(`Service Worker: ${medicine.name}の通知を表示しました`);
    })
    .catch((error) => {
      console.error(`Service Worker: 通知の表示に失敗しました: ${error}`);
    });
}

// 通知スケジュールを登録する関数
function registerNotificationSchedule(medicine) {
  if (!medicine || !medicine.id || !medicine.time) {
    console.error(
      "Service Worker: 通知スケジュールの登録に必要なデータが不足しています"
    );
    return;
  }

  // 重複を避けるために同じIDの既存のスケジュールを探す
  const existingIndex = notificationSchedules.findIndex(
    (schedule) => schedule.id === medicine.id
  );

  if (existingIndex >= 0) {
    // 既存のスケジュールを更新
    notificationSchedules[existingIndex] = medicine;
    console.log(
      `Service Worker: ${medicine.name}の通知スケジュールを更新しました`
    );
  } else {
    // 新しいスケジュールを追加
    notificationSchedules.push(medicine);
    console.log(
      `Service Worker: ${medicine.name}の通知スケジュールを追加しました（合計: ${notificationSchedules.length}件）`
    );
  }

  // スケジュールをIndexedDBに保存
  saveSchedulesToIndexedDB();
}

// 特定の薬の通知スケジュールを削除する関数
function removeNotificationSchedule(medicineId) {
  if (!medicineId) {
    console.error(
      "Service Worker: 削除する通知スケジュールのIDが指定されていません"
    );
    return;
  }

  const initialLength = notificationSchedules.length;
  notificationSchedules = notificationSchedules.filter(
    (schedule) => schedule.id !== medicineId
  );

  if (notificationSchedules.length < initialLength) {
    console.log(
      `Service Worker: ${medicineId}の通知スケジュールを削除しました（残り: ${notificationSchedules.length}件）`
    );
    saveSchedulesToIndexedDB();
  } else {
    console.log(
      `Service Worker: ${medicineId}の通知スケジュールは見つかりませんでした`
    );
  }
}

// すべての通知スケジュールを削除する関数
function removeAllNotificationSchedules() {
  const count = notificationSchedules.length;
  notificationSchedules = [];
  console.log(
    `Service Worker: ${count}件のすべての通知スケジュールを削除しました`
  );
  saveSchedulesToIndexedDB();
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
  let notificationShown = false;

  // 同時に複数の通知が表示される問題を防止するためのデバウンス
  const lastGlobalNotification = lastGlobalNotifications.notification || 0;
  const shouldDebounceGlobal =
    now - lastGlobalNotification < NOTIFICATION_DEBOUNCE_MS;

  if (shouldDebounceGlobal) {
    console.log(
      `Service Worker: 最後の通知から${
        (now - lastGlobalNotification) / 1000
      }秒しか経過していないため、通知をスキップします`
    );
    return false;
  }

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

        // 最後の通知時間を更新（グローバルとこの薬の両方）
        lastNotificationTimes[medicineId] = now;
        lastGlobalNotifications.notification = now;
        notificationShown = true;

        try {
          // 通知を表示
          await showNotificationForMedicine(schedule);

          // フォアグラウンドのクライアントも通知
          const clients = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

          // メッセージ送信時間の記録用オブジェクトを初期化
          if (!self._lastMessageTimes) {
            self._lastMessageTimes = {};
          }
          const messageKey = `playSound-${medicineId}`;
          const lastMessageTime = self._lastMessageTimes[messageKey] || 0;
          const DEBOUNCE_TIME = 2000; // 2秒以内のメッセージは重複して送らない

          if (now - lastMessageTime < DEBOUNCE_TIME) {
            console.log(
              `Service Worker: ${
                schedule.name
              }の通知音メッセージは最近送信済み(${
                (now - lastMessageTime) / 1000
              }秒前)です`
            );
            return;
          }

          // 最新の送信時間を記録
          self._lastMessageTimes[messageKey] = now;

          // クライアントにメッセージを送信
          const allClients = await clients.matchAll({
            includeUncontrolled: true,
          });

          if (allClients.length > 0) {
            // クライアントが存在する場合は最初の1つだけにメッセージを送信
            const client = allClients[0];
            client.postMessage({
              type: "PLAY_NOTIFICATION_SOUND",
              medicineId: schedule.id,
              time: now,
            });
            console.log(
              `Service Worker: ${schedule.name}の通知音メッセージを送信しました (クライアント: ${client.id})`
            );
          } else {
            console.log(
              "Service Worker: アクティブなクライアントが見つかりません"
            );
          }

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
        } catch (error) {
          console.error(`Service Worker: 通知の表示に失敗しました: ${error}`);
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

  // 通知が表示された場合はアプリを起動する（バックグラウンドでも通知を確実に届けるため）
  if (notificationShown) {
    // クライアントの状態を確認
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    if (clients.length === 0) {
      // クライアントが存在しない場合（アプリが閉じている場合）
      // スマホでもバックグラウンドで通知が表示されるようにする
      console.log(
        "Service Worker: クライアントが見つかりません、音声再生用にウィンドウを起動しようとします"
      );

      try {
        // URLにパラメータを付けてクライアントを起動する試み
        await self.clients.openWindow(
          `${self.registration.scope}?notification=sound&time=${Date.now()}`
        );
        console.log(
          "Service Worker: バックグラウンド通知のためにクライアントを起動しました"
        );
      } catch (error) {
        console.error("Service Worker: クライアント起動エラー", error);
      }
    } else {
      console.log("Service Worker: 既存のクライアントに通知を送信します");
    }
  }

  return notificationShown;
}

// 薬の通知を表示する関数
async function showNotificationForMedicine(schedule) {
  // 重複通知防止のため、最後の通知時間をチェック
  const now = Date.now();
  const lastNotificationTime = lastNotificationTimes[schedule.id] || 0;

  if (now - lastNotificationTime < NOTIFICATION_MIN_INTERVAL) {
    console.log(
      `Service Worker: ${schedule.name}の通知は最近送信されたため(${
        (now - lastNotificationTime) / 1000
      }秒前)、重複を防止します`
    );
    return false;
  }

  // グローバル通知時間もチェック
  const lastGlobalNotification = lastGlobalNotifications.notification || 0;
  if (now - lastGlobalNotification < NOTIFICATION_DEBOUNCE_MS) {
    console.log(
      `Service Worker: 最後の通知から${
        (now - lastGlobalNotification) / 1000
      }秒しか経過していないため、通知をスキップします`
    );
    return false;
  }

  // 最後の通知時間を更新
  lastNotificationTimes[schedule.id] = now;
  lastGlobalNotifications.notification = now;

  try {
    // 通知を表示
    await self.registration.showNotification("お薬の時間です", {
      body: `${schedule.name}を服用する時間です`,
      icon: "/icon/favicon.ico",
      badge: "/icon/favicon.ico",
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
      // 重要: Androidの一部バージョンでの問題を回避するためのデータ
      data: {
        medicineId: schedule.id,
        name: schedule.name,
        timeStamp: new Date().toISOString(),
      },
    });

    console.log(`Service Worker: ${schedule.name}の通知を表示しました`);

    // 音声再生用の関数を使用
    await playNotificationSoundOnClients();

    return true;
  } catch (error) {
    console.error(`Service Worker: 通知の表示に失敗しました: ${error}`);
  }

  return false;
}
