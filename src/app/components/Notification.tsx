"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Medicine } from "./MedicineList";

// Web Notification API用の型定義
declare global {
  interface Window {
    Notification: {
      permission: string;
      requestPermission(): Promise<string>;
      new (
        title: string,
        options?: {
          body: string;
          icon?: string;
          vibrate?: number[];
          requireInteraction?: boolean;
        }
      ): Notification;
    };
    AudioContext: {
      new (): AudioContext;
    };
    webkitAudioContext: {
      new (): AudioContext;
    };
    SyncManager: unknown; // バックグラウンド同期用
  }

  interface ServiceWorkerRegistration {
    // バックグラウンド同期用の型定義を追加
    sync?: {
      register(tag: string): Promise<void>;
    };
    periodicSync?: {
      register(tag: string, options: { minInterval: number }): Promise<void>;
    };
  }
}

type NotificationProps = {
  medicines: Medicine[];
  onNotificationClick: (id: string) => void;
};

// Scheduleの型定義を追加
type ScheduleType = {
  id: string;
  name: string;
  time: string;
  nextNotification: number;
  daily: boolean;
};

export default function Notification({
  medicines,
  onNotificationClick,
}: NotificationProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [currentTime, setCurrentTime] = useState<string>("");
  const [notificationMedicine, setNotificationMedicine] =
    useState<Medicine | null>(null);
  const [showNotification, setShowNotification] = useState<boolean>(false);
  const [reminderShown, setReminderShown] = useState<Set<string>>(new Set());

  // 通知の許可状態を追跡
  const [notificationPermission, setNotificationPermission] =
    useState<string>("default");

  // 音声再生のためのref（AudioAPIを使用）
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 音声再生中かどうかを追跡
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // 通知のデバウンス処理用
  const lastNotificationRef = useRef<{ time: number; id: string | null }>({
    time: 0,
    id: null,
  });
  const NOTIFICATION_DEBOUNCE_MS = 3000; // 3秒以内の同一薬の通知は無視

  // メッセージ送信イベントを追跡
  const messageEventRef = useRef<{
    lastTime: number;
    sentMessages: Map<string, number>;
  }>({
    lastTime: 0,
    sentMessages: new Map(),
  });

  // 現在時刻を取得し、形式を"HH:MM"に変換する関数
  const formatCurrentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  };

  // 通知がクリックされたときのハンドラ
  const handleNotificationClick = useCallback(
    (medicine: Medicine) => {
      if (onNotificationClick) {
        onNotificationClick(medicine.id);
      }
    },
    [onNotificationClick]
  );

  // 音声を再生する関数
  const playNotificationSound = useCallback(() => {
    // 既に再生中なら再生しない
    if (isPlaying) {
      console.log("既に音声再生中のため、新しい再生はスキップします");
      return;
    }

    try {
      if (audioRef.current) {
        setIsPlaying(true);

        // 現在時刻を使ってキャッシュバスティング
        const timestamp = new Date().getTime();

        // 新しいAudio要素を作成（メモリリークを防ぐため、使い捨てにする）
        const tempAudio = new Audio(
          `/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav?t=${timestamp}`
        );

        // 音量設定
        tempAudio.volume = 1.0;

        // モバイルでの自動再生制限に対応するためユーザーインタラクションを模倣
        interface WebkitWindow extends Window {
          webkitAudioContext: typeof AudioContext;
        }

        const AudioContextClass =
          window.AudioContext || (window as WebkitWindow).webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          context
            .resume()
            .catch((err) => console.log("AudioContext resume error:", err));
        }

        // プリロードして準備
        tempAudio.preload = "auto";

        // 読み込み開始イベント
        tempAudio.addEventListener("loadstart", () => {
          console.log("音声ファイルの読み込みを開始しました");
        });

        // エラーハンドリングを強化
        tempAudio.addEventListener("error", (e) => {
          console.error("音声読み込みエラー:", e);
          setIsPlaying(false);

          // 代替方法を試す - fetch APIでファイルの存在確認
          fetch(
            `/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav?t=${timestamp}`
          )
            .then((response) => {
              if (response.ok) {
                console.log(
                  "音声ファイルは存在していますが、再生できません。代替方法を試みます"
                );

                // 新しいAudio要素で再試行
                const alternativeAudio = new Audio();
                alternativeAudio.src = `/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav?t=${timestamp}`;
                alternativeAudio.volume = 1.0;
                alternativeAudio.play().catch((err) => {
                  console.warn("代替方法でも音声再生に失敗:", err);
                  setIsPlaying(false); // 再生に失敗した場合も状態をリセット
                });

                // 再生完了時の処理を追加
                alternativeAudio.addEventListener("ended", () => {
                  console.log("代替方法の音声再生が完了しました");
                  setIsPlaying(false);
                  // メモリリークを防ぐため明示的に解放
                  alternativeAudio.src = "";
                  alternativeAudio.remove();
                });
              } else {
                console.error("音声ファイルが見つかりません:", response.status);
                setIsPlaying(false);
              }
            })
            .catch((err) => {
              console.error("音声ファイルの確認に失敗:", err);
              setIsPlaying(false);
            });
        });

        // 再生完了時の処理
        tempAudio.addEventListener("ended", () => {
          console.log("音声再生が完了しました");
          setIsPlaying(false);
          // メモリリークを防ぐため明示的に解放
          tempAudio.src = "";
          tempAudio.remove();
        });

        // 安全に再生するためタイムアウト設定
        const playPromise = tempAudio.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("音声再生を開始しました");
            })
            .catch((error) => {
              console.error("音声再生に失敗しました:", error);
              setIsPlaying(false);

              // もう一度試す（モバイルブラウザでは最初のユーザーインタラクションが必要）
              setTimeout(() => {
                if (isPlaying) {
                  console.log(
                    "再試行をスキップします（既に別の再生処理が進行中）"
                  );
                  return;
                }

                setIsPlaying(true);
                const retryAudio = new Audio(
                  "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav"
                );
                retryAudio.volume = 1.0;

                // 再生終了時のイベントリスナーを追加
                retryAudio.addEventListener("ended", () => {
                  console.log("再試行音声の再生が完了しました");
                  setIsPlaying(false);
                  retryAudio.src = "";
                  retryAudio.remove();
                });

                retryAudio.play().catch(() => {
                  // エラーは無視（ログが大量に出るのを防ぐ）
                  setIsPlaying(false);
                });
              }, 500);
            });
        }
      }
    } catch (error) {
      console.error("音声再生中にエラーが発生しました:", error);
      setIsPlaying(false);
    }
  }, [isPlaying]);

  // 通知を表示する関数
  const showNotificationAlert = useCallback(
    (medicine: Medicine) => {
      // アプリ内通知を表示
      setNotificationMedicine(medicine);
      setShowNotification(true);

      // 音声通知を再生
      playNotificationSound();

      // ブラウザ通知を試行
      try {
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          notificationPermission === "granted"
        ) {
          // Service Workerを通じて通知を表示（バックグラウンドでも確実に通知されるため）
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "SCHEDULE_NOTIFICATION",
              medicine: {
                id: medicine.id,
                name: medicine.name,
                tag: `medicine-${medicine.id}`,
              },
            });
            console.log(`${medicine.name}の通知をService Workerに依頼しました`);
          } else {
            // フォールバックとしてブラウザ通知を直接表示
            new window.Notification("お薬の時間です", {
              body: `${medicine.name}を服用する時間です`,
              icon: "/icon/favicon.ico", // アイコンを追加して目立たせる
              tag: `medicine-${medicine.id}`, // 同じタグの通知は上書きされる
              requireInteraction: true, // ユーザーがアクションを起こすまで通知を表示したままにする
            });
          }
        }
      } catch (error) {
        console.error("ブラウザ通知の表示に失敗しました:", error);
      }
    },
    [notificationPermission, playNotificationSound]
  );

  // 通知の許可をリクエストする関数
  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("このブラウザはWeb通知をサポートしていません");
      return;
    }

    try {
      // Notification APIの型を定義
      const Notification = window.Notification as {
        permission: string;
        requestPermission: () => Promise<string>;
      };

      // 通知の許可状態を確認
      const permission = Notification.permission;
      setNotificationPermission(permission);
      console.log("現在の通知許可状態:", permission);

      // まだ許可または拒否されていない場合、許可を求める
      if (permission !== "granted" && permission !== "denied") {
        try {
          // モダンブラウザ向け：Promiseベースの許可リクエスト
          const newPermission = await Notification.requestPermission();
          console.log("通知許可リクエスト結果:", newPermission);
          setNotificationPermission(newPermission);
        } catch (error) {
          // 古いブラウザ向け：コールバックベースの許可リクエスト
          console.warn(
            "通知許可のPromiseが使用できません。コールバック方式を試行します:",
            error
          );
          try {
            // レガシーブラウザのためのフォールバック
            window.Notification.requestPermission(function (result) {
              console.log("通知許可リクエスト結果(コールバック):", result);
              setNotificationPermission(result);
            });
          } catch (callbackError) {
            console.error(
              "通知許可のコールバック方式も失敗しました:",
              callbackError
            );
          }
        }
      }
    } catch (error) {
      console.error("通知の許可リクエストに失敗しました:", error);
    }
  };

  // Service Workerを登録する関数
  const registerServiceWorker = useCallback(async () => {
    // スマホで通知を確実に受け取るために必要なService Worker登録
    if ("serviceWorker" in navigator) {
      try {
        // Service Workerのキャッシュをクリアするため、クエリパラメータを追加
        const swUrl = `/sw.js?v=${new Date().getTime()}`;
        console.log("Service Worker登録を試行:", swUrl);

        // 現在の登録状態を確認
        const existingRegistration =
          await navigator.serviceWorker.getRegistration();

        // 既に登録されていれば登録を解除してから再登録する
        if (existingRegistration) {
          console.log("既存のService Worker登録を更新します");
          try {
            await existingRegistration.update();
            console.log("Service Worker更新を要求しました");
          } catch (updateError) {
            console.error("Service Worker更新に失敗:", updateError);
          }
        }

        // Service Workerを登録（新規または更新）
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: "/",
          updateViaCache: "none", // キャッシュを使わず常に最新のService Workerを取得
        });
        console.log("Service Worker 登録成功:", registration.scope);

        // サービスワーカーの更新をチェック
        await registration.update().catch((error) => {
          console.error("Service Worker の更新に失敗:", error);
        });

        // プッシュ通知の許可を求める
        handlePushPermission(registration);

        // 一度テスト通知を送信
        setTimeout(() => {
          sendDebugMessageToServiceWorker();
        }, 2000);

        return registration;
      } catch (error) {
        console.error("Service Worker 登録失敗:", error);

        // エラーの詳細をログに出力
        if (error instanceof Error) {
          console.error("エラーの詳細:", error.message);
          console.error("スタックトレース:", error.stack);
        }

        // 再試行
        setTimeout(() => {
          console.log("Service Worker登録を5秒後に再試行します");
          registerServiceWorker();
        }, 5000);
      }
    } else {
      console.warn("このブラウザはService Workerをサポートしていません");
    }

    return null;
  }, [notificationPermission]);

  // デバッグメッセージをService Workerに送信する関数
  const sendDebugMessageToServiceWorker = useCallback(() => {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "DEBUG_TEST",
        time: new Date().toISOString(),
      });
      console.log("Service Workerにデバッグメッセージを送信しました");
    }
  }, []);

  // プッシュ通知の許可を処理する関数
  const handlePushPermission = useCallback(
    async (registration: ServiceWorkerRegistration) => {
      if (registration.pushManager) {
        try {
          // 通知の許可状態に関わらず、常にプッシュ通知の許可を要求
          if (notificationPermission !== "denied") {
            // まだ許可されていない場合は許可を求める
            if (notificationPermission !== "granted") {
              await requestNotificationPermission();
            }

            // プッシュ通知のサブスクリプション状態をチェック
            const subscription =
              await registration.pushManager.getSubscription();

            if (subscription) {
              console.log(
                "既存のプッシュ通知サブスクリプション:",
                subscription.endpoint
              );
              return;
            }

            console.log(
              "プッシュ通知サブスクリプションがありません、新規作成します"
            );

            // プッシュ通知の登録を試みる
            try {
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                  "BF7cGGTOLlLmP_B4nMjVH2_GFf3jSQIAn09XTKe2t9HwVLFOm0z6oJyPBa1CzC4Uxb9aXO7X_L5Xev-5nGnJkPc"
                ),
              });
              console.log("プッシュ通知の登録成功:", subscription.endpoint);
            } catch (pushSubscribeError) {
              console.error("プッシュ通知の登録に失敗:", pushSubscribeError);
            }
          } else {
            console.warn(
              "プッシュ通知の許可が拒否されています:",
              notificationPermission
            );
          }
        } catch (pushError) {
          console.error("プッシュ通知の登録処理に失敗:", pushError);
        }
      } else {
        console.warn(
          "このブラウザはプッシュ通知マネージャーをサポートしていません"
        );
      }
    },
    [notificationPermission, requestNotificationPermission]
  );

  // base64文字列をUint8Arrayに変換する関数
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // ServiceWorkerを定期的に呼び出す処理を追加
  const requestBackgroundSync = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;

        // 同期タスクを登録
        if (registration.sync) {
          await registration.sync.register("notification-check");
          console.log("バックグラウンド同期を登録しました");
        }

        // Periodic Sync APIが使用可能かどうかチェック
        if ("periodicSync" in registration && registration.periodicSync) {
          // 許可状態を確認
          try {
            const status = await navigator.permissions.query({
              name: "periodic-background-sync" as PermissionName,
            });

            if (status.state === "granted") {
              // 1分ごとの定期的同期を設定（バックグラウンドでの通知チェック用）
              await registration.periodicSync.register("notification-sync", {
                minInterval: 60 * 1000, // 1分ごと
              });
              console.log(
                "定期的バックグラウンド同期を登録しました（1分ごと）"
              );

              // 長期的な同期のバックアップとして1時間ごとの同期も設定
              await registration.periodicSync.register(
                "notification-hourly-sync",
                {
                  minInterval: 60 * 60 * 1000, // 1時間ごと
                }
              );
              console.log(
                "バックアップ用の定期的バックグラウンド同期を登録しました（1時間ごと）"
              );
            } else {
              console.log(
                "定期的バックグラウンド同期の権限がありません:",
                status.state
              );

              // 権限がない場合もService Workerへの通知チェック依頼を送信
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                  type: "CHECK_NOTIFICATION_SCHEDULES",
                  time: new Date().toISOString(),
                });
                console.log(
                  "Service Workerに通知チェックリクエストを送信しました"
                );
              }
            }
          } catch (permissionError) {
            console.warn("権限の確認に失敗:", permissionError);

            // エラーが発生した場合もService Workerへの通知チェック依頼を送信
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: "CHECK_NOTIFICATION_SCHEDULES",
                time: new Date().toISOString(),
              });
              console.log(
                "Service Workerに通知チェックリクエストを送信しました"
              );
            }
          }
        } else {
          console.warn(
            "このデバイスは定期的バックグラウンド同期をサポートしていません"
          );

          // 定期的同期がサポートされていない場合もService Workerへの通知チェック依頼を送信
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "CHECK_NOTIFICATION_SCHEDULES",
              time: new Date().toISOString(),
            });
            console.log("Service Workerに通知チェックリクエストを送信しました");
          }
        }
      } catch (error) {
        console.error("バックグラウンド同期の登録に失敗:", error);
      }
    } else {
      console.warn("このブラウザはバックグラウンド同期をサポートしていません");
    }
  }, []);

  // 定期的な通知をスケジュールする関数
  const scheduleNotification = useCallback(
    async (medicine: Medicine) => {
      if ("serviceWorker" in navigator && "Notification" in window) {
        try {
          // 通知の許可状態を確認
          if (notificationPermission !== "granted") {
            console.log("通知の許可がありません");
            return;
          }

          // 現在時刻から次の通知時刻を計算
          const now = new Date();
          const [hours, minutes] = medicine.time.split(":").map(Number);
          const notificationTime = new Date();
          notificationTime.setHours(hours, minutes, 0, 0);

          // 時間が過ぎていたら明日の同じ時間にスケジュール
          if (notificationTime < now) {
            notificationTime.setDate(notificationTime.getDate() + 1);
          }

          // 通知までの待機時間（ミリ秒）
          const waitTime = notificationTime.getTime() - now.getTime();
          console.log(
            `【通知スケジュール】${
              medicine.name
            }の通知を${waitTime}ミリ秒後（${new Date(
              now.getTime() + waitTime
            ).toLocaleString()}）にスケジュール`
          );

          // ローカルストレージに通知予定を保存（アプリが閉じても通知されるため）
          try {
            const schedulesJson =
              localStorage.getItem("notificationSchedules") || "[]";
            let schedules = JSON.parse(schedulesJson) as ScheduleType[];

            // 重複データの削除（同じID、同じ時間のスケジュールは最新のもののみ残す）
            const uniqueSchedules: ScheduleType[] = [];
            const seen = new Set();

            schedules.forEach((schedule: ScheduleType) => {
              const key = `${schedule.id}-${schedule.time}`;
              if (!seen.has(key)) {
                seen.add(key);
                uniqueSchedules.push(schedule);
              }
            });

            // クリーニングした結果を再保存
            if (schedules.length !== uniqueSchedules.length) {
              localStorage.setItem(
                "notificationSchedules",
                JSON.stringify(uniqueSchedules)
              );
              console.log(
                `重複スケジュールを${
                  schedules.length - uniqueSchedules.length
                }件削除しました`
              );
              schedules = uniqueSchedules;
            }

            if (schedules.length > 0) {
              console.log(
                `保存された${schedules.length}件の通知スケジュールを読み込みました`
              );

              // ページが開かれた時点で未来の通知のみを再スケジュール
              const now = new Date().getTime();

              // 表示頻度を抑えるため、前回処理したスケジュールを記録
              const processedSchedules = new Set();

              schedules.forEach((schedule: ScheduleType) => {
                // 次の通知時刻が過去の場合は、新しい通知時刻を計算
                if (schedule.nextNotification < now) {
                  // 時刻を解析
                  const [hours, minutes] = schedule.time.split(":").map(Number);
                  const nextDate = new Date();
                  nextDate.setHours(hours, minutes, 0, 0);

                  // 今日の指定時刻がすでに過ぎている場合は明日にスケジュール
                  if (nextDate.getTime() < now) {
                    nextDate.setDate(nextDate.getDate() + 1);
                  }

                  schedule.nextNotification = nextDate.getTime();
                }

                // 通知時刻までの待機時間
                const waitTime = schedule.nextNotification - now;

                // キーを作成して重複通知を防止
                const scheduleKey = `${schedule.id}-${schedule.time}`;

                // このスケジュールがまだ処理されていない場合のみ処理
                if (!processedSchedules.has(scheduleKey)) {
                  processedSchedules.add(scheduleKey);

                  // 薬の情報から通知を再スケジュール
                  console.log(
                    `保存されたスケジュールから ${schedule.name} の通知を ${waitTime}ms 後に再設定します`
                  );

                  // 同じ薬に対する通知が多数発生しないように制限を設ける
                  if (waitTime > 0 && waitTime < 24 * 60 * 60 * 1000) {
                    setTimeout(() => {
                      // 該当する薬を現在のリストから探す
                      const medicine = medicines.find(
                        (m) => m.id === schedule.id
                      );
                      if (medicine && !medicine.taken) {
                        // 見つかった場合は通知を表示
                        console.log(
                          `保存されたスケジュールから ${schedule.name} の通知時間になりました`
                        );
                        showNotificationAlert(medicine);
                      }
                    }, waitTime);
                  }
                }
              });

              // クリーニング後のスケジュールを保存
              localStorage.setItem(
                "notificationSchedules",
                JSON.stringify(schedules)
              );
            }
          } catch (error) {
            console.error("保存された通知スケジュールの読み込みに失敗:", error);
          }

          // ServiceWorkerに長期通知をスケジュール
          try {
            await navigator.serviceWorker.ready;
            if (navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: "REGISTER_NOTIFICATION_SCHEDULE",
                medicine: {
                  id: medicine.id,
                  name: medicine.name,
                  time: medicine.time,
                  nextNotification: notificationTime.getTime(),
                  daily: medicine.daily,
                },
              });
              console.log(
                `${medicine.name}の長期通知スケジュールをServiceWorkerに登録しました`
              );
            }
          } catch (swError) {
            console.error("ServiceWorkerスケジュール登録エラー:", swError);
          }

          // シミュレートされたプッシュ通知をスケジュール
          setTimeout(async () => {
            try {
              console.log(`【通知実行】${medicine.name}の通知時間になりました`);

              // ServiceWorkerの登録を取得
              const swRegistration = await navigator.serviceWorker.ready;

              // カスタムのプッシュイベントをシミュレート
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                  type: "SCHEDULE_NOTIFICATION",
                  medicine: {
                    id: medicine.id,
                    name: medicine.name,
                    tag: `medicine-${medicine.id}`,
                  },
                });
                console.log(
                  `${medicine.name}の通知メッセージをServiceWorkerに送信しました`
                );

                // フォールバックとしてローカル通知も表示
                showNotificationAlert(medicine);
              } else {
                console.warn(
                  "ServiceWorkerコントローラーがありません - ローカル通知を表示します"
                );

                // ローカル通知を使用
                swRegistration.showNotification("お薬の時間です", {
                  body: `${medicine.name}を服用する時間です`,
                  icon: "/favicon.ico",
                  tag: `medicine-${medicine.id}`,
                  requireInteraction: true,
                });

                // アプリ内通知も表示
                showNotificationAlert(medicine);
              }
            } catch (error) {
              console.error("通知のスケジュールに失敗:", error);
              // エラーが発生した場合でもアプリ内通知は表示
              showNotificationAlert(medicine);
            }
          }, waitTime);

          // 毎日の通知の場合は24時間後にも再スケジュール
          if (medicine.daily) {
            setTimeout(() => {
              scheduleNotification(medicine);
            }, 24 * 60 * 60 * 1000);
          }
        } catch (error) {
          console.error("通知スケジュールに失敗:", error);
        }
      }
    },
    [showNotificationAlert, notificationPermission]
  );

  // コンポーネントマウント時に通知許可をリクエストし、Service Workerを登録
  useEffect(() => {
    console.log("===============================================");
    console.log("🔔 通知コンポーネントを初期化します");
    console.log("===============================================");

    // Audio要素を作成
    const audio = new Audio(
      "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav"
    );
    audio.preload = "auto"; // 事前に読み込み
    audioRef.current = audio;

    // 初期化処理は一度だけ実行
    const initialized = localStorage.getItem("notification_initialized");
    const now = new Date().getTime();

    // 前回の初期化から1分以上経過している場合のみ実行（無限ループ防止）
    const lastInitTime = initialized ? parseInt(initialized, 10) : 0;
    if (!initialized || now - lastInitTime > 60000) {
      localStorage.setItem("notification_initialized", now.toString());

      requestNotificationPermission();

      // Service Workerの登録（スマホでバックグラウンド通知に対応するため）
      registerServiceWorker().then(() => {
        // ServiceWorkerの登録後にバックグラウンド同期を設定
        requestBackgroundSync();
      });

      // ローカルストレージから通知スケジュールを読み込み
      try {
        const schedulesJson =
          localStorage.getItem("notificationSchedules") || "[]";
        let schedules = JSON.parse(schedulesJson) as ScheduleType[];

        // 重複データの削除（同じID、同じ時間のスケジュールは最新のもののみ残す）
        const uniqueSchedules: ScheduleType[] = [];
        const seen = new Set();

        schedules.forEach((schedule: ScheduleType) => {
          const key = `${schedule.id}-${schedule.time}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueSchedules.push(schedule);
          }
        });

        // クリーニングした結果を再保存
        if (schedules.length !== uniqueSchedules.length) {
          localStorage.setItem(
            "notificationSchedules",
            JSON.stringify(uniqueSchedules)
          );
          console.log(
            `重複スケジュールを${
              schedules.length - uniqueSchedules.length
            }件削除しました`
          );
          schedules = uniqueSchedules;
        }

        if (schedules.length > 0) {
          console.log(
            `保存された${schedules.length}件の通知スケジュールを読み込みました`
          );

          // ページが開かれた時点で未来の通知のみを再スケジュール
          const now = new Date().getTime();

          // 表示頻度を抑えるため、前回処理したスケジュールを記録
          const processedSchedules = new Set();

          schedules.forEach((schedule: ScheduleType) => {
            // 次の通知時刻が過去の場合は、新しい通知時刻を計算
            if (schedule.nextNotification < now) {
              // 時刻を解析
              const [hours, minutes] = schedule.time.split(":").map(Number);
              const nextDate = new Date();
              nextDate.setHours(hours, minutes, 0, 0);

              // 今日の指定時刻がすでに過ぎている場合は明日にスケジュール
              if (nextDate.getTime() < now) {
                nextDate.setDate(nextDate.getDate() + 1);
              }

              schedule.nextNotification = nextDate.getTime();
            }

            // 通知時刻までの待機時間
            const waitTime = schedule.nextNotification - now;

            // キーを作成して重複通知を防止
            const scheduleKey = `${schedule.id}-${schedule.time}`;

            // このスケジュールがまだ処理されていない場合のみ処理
            if (!processedSchedules.has(scheduleKey)) {
              processedSchedules.add(scheduleKey);

              // 薬の情報から通知を再スケジュール
              console.log(
                `保存されたスケジュールから ${schedule.name} の通知を ${waitTime}ms 後に再設定します`
              );

              // 同じ薬に対する通知が多数発生しないように制限を設ける
              if (waitTime > 0 && waitTime < 24 * 60 * 60 * 1000) {
                setTimeout(() => {
                  // 該当する薬を現在のリストから探す
                  const medicine = medicines.find((m) => m.id === schedule.id);
                  if (medicine && !medicine.taken) {
                    // 見つかった場合は通知を表示
                    console.log(
                      `保存されたスケジュールから ${schedule.name} の通知時間になりました`
                    );
                    showNotificationAlert(medicine);
                  }
                }, waitTime);
              }
            }
          });

          // クリーニング後のスケジュールを保存
          localStorage.setItem(
            "notificationSchedules",
            JSON.stringify(schedules)
          );
        }
      } catch (error) {
        console.error("保存された通知スケジュールの読み込みに失敗:", error);
      }
    } else {
      const timeSinceLastInit = (now - lastInitTime) / 1000;
      console.log(
        `前回の初期化から${timeSinceLastInit}秒しか経過していないため、初期化をスキップします`
      );
    }

    // ServiceWorkerを定期的に起こして通知をチェック（バックグラウンドでも動作させるため）
    const wakeInterval = setInterval(() => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "CHECK_NOTIFICATION_SCHEDULES",
          time: new Date().toISOString(),
        });
      }
    }, 60000); // 1分ごとに確認

    // コンポーネントのアンマウント時にクリーンアップ
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      clearInterval(wakeInterval);
    };
  }, [
    registerServiceWorker,
    medicines,
    showNotificationAlert,
    requestBackgroundSync,
  ]);

  // 1分ごとに薬の時間をチェック
  useEffect(() => {
    // 最後の通知時間を追跡するためのオブジェクト
    const lastNotificationTimes: Record<string, number> = {};

    const checkMedicationTime = () => {
      const time = formatCurrentTime();
      setCurrentTime(time);
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD形式
      const now = new Date().getTime();

      // 服用していない薬の中で現在時刻に一致するものを確認
      const medicineToNotify = medicines.find((medicine) => {
        // 時間が一致している
        const timeMatch = medicine.time === time;
        // 服用していない
        const notTaken = !medicine.taken;
        // 毎日服用するか、今日がまだ通知されていない
        const shouldNotify =
          medicine.daily || !reminderShown.has(`${medicine.id}-${today}`);

        // 最後の通知から1分以上経過しているか確認
        const lastNotificationTime = lastNotificationTimes[medicine.id] || 0;
        const timePassedSinceLastNotification =
          now - lastNotificationTime >= 60000; // 1分 = 60000ms

        return (
          timeMatch &&
          notTaken &&
          shouldNotify &&
          timePassedSinceLastNotification
        );
      });

      if (medicineToNotify) {
        // 通知を表示
        showNotificationAlert(medicineToNotify);

        // 最後の通知時間を更新
        lastNotificationTimes[medicineToNotify.id] = now;

        // 通知済みとしてマーク
        if (!medicineToNotify.daily) {
          setReminderShown((prev) =>
            new Set(prev).add(`${medicineToNotify.id}-${today}`)
          );
        }
      }
    };

    // 初回実行
    checkMedicationTime();

    // すべての薬剤のスケジュール通知を設定
    medicines.forEach((medicine) => {
      if (!medicine.taken) {
        scheduleNotification(medicine);
      }
    });

    // 1分ごとにチェック
    const timer = setInterval(checkMedicationTime, 60000);

    return () => clearInterval(timer);
  }, [
    medicines,
    reminderShown,
    notificationPermission,
    showNotificationAlert,
    scheduleNotification,
  ]);

  // 10秒後に未服用のものは自動で「まだ飲んでないかも」通知
  useEffect(() => {
    if (notificationMedicine && showNotification) {
      const reminderTimeout = setTimeout(() => {
        if (
          medicines.find((m) => m.id === notificationMedicine.id && !m.taken)
        ) {
          try {
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              notificationPermission === "granted"
            ) {
              // Service Workerを通じてリマインダー通知を表示
              if (
                navigator.serviceWorker &&
                navigator.serviceWorker.controller
              ) {
                navigator.serviceWorker.controller.postMessage({
                  type: "SCHEDULE_NOTIFICATION",
                  medicine: {
                    id: notificationMedicine.id,
                    name: `${notificationMedicine.name}（リマインダー）`,
                    tag: `medicine-reminder-${notificationMedicine.id}`,
                  },
                });
                console.log(
                  `${notificationMedicine.name}のリマインダー通知をService Workerに依頼しました`
                );
              } else {
                // フォールバックとして直接リマインダー通知を表示
                new window.Notification("お薬を飲み忘れていませんか？", {
                  body: `${notificationMedicine.name}をまだ飲んでいないようです`,
                  icon: "/icon/favicon.ico", // アイコンを追加
                  requireInteraction: true, // ユーザーの操作があるまで通知を表示し続ける
                  tag: `medicine-reminder-${notificationMedicine.id}`, // 同じタグの通知は上書きされる
                });
              }

              // リマインダー通知の音声も再生
              playNotificationSound();
            }
          } catch (error) {
            console.error("リマインダー通知の表示に失敗しました:", error);
          }
        }
        setShowNotification(false);
      }, 10000); // 10秒後

      return () => clearTimeout(reminderTimeout);
    }
  }, [
    notificationMedicine,
    showNotification,
    medicines,
    notificationPermission,
    playNotificationSound,
  ]);

  // 通知音を再生する処理
  const handleNotificationForMedicine = useCallback(
    (medicine: Medicine) => {
      const now = Date.now();
      const lastNotification = lastNotificationRef.current;

      // 同じ薬の通知が短時間に複数回来た場合は無視
      if (
        medicine.id === lastNotification.id &&
        now - lastNotification.time < NOTIFICATION_DEBOUNCE_MS
      ) {
        console.log(
          `${medicine.name}の通知は最近処理済み(${Math.floor(
            (now - lastNotification.time) / 1000
          )}秒前)のためスキップします`
        );
        return;
      }

      // 最終通知情報を更新
      lastNotificationRef.current = {
        time: now,
        id: medicine.id,
      };

      console.log(`${medicine.name}の通知を処理します`);
      setNotificationMedicine(medicine);
      setShowNotification(true);

      // 音声を再生
      playNotificationSound();
    },
    [playNotificationSound]
  );

  // Service Workerからのメッセージを処理
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      // デバッグ応答をスキップ
      if (event.data?.type === "DEBUG_RESPONSE") {
        return;
      }

      // 通知音再生のリクエスト
      if (event.data?.type === "PLAY_NOTIFICATION_SOUND") {
        const now = Date.now();
        const medicineId = event.data.medicineId;

        // メッセージの重複防止処理
        const messageKey = `${event.data.type}-${
          medicineId || "unknown"
        }-${Math.floor(now / 1000)}`;
        const lastMessageTime =
          messageEventRef.current.sentMessages.get(messageKey) || 0;

        if (now - lastMessageTime < NOTIFICATION_DEBOUNCE_MS) {
          console.log(
            `重複メッセージを検出しました: ${messageKey} (${
              now - lastMessageTime
            }ms)`
          );
          return;
        }

        messageEventRef.current.sentMessages.set(messageKey, now);

        // マップサイズを制限（古いエントリを削除）
        if (messageEventRef.current.sentMessages.size > 50) {
          const oldestKey = [
            ...messageEventRef.current.sentMessages.keys(),
          ].sort()[0];
          messageEventRef.current.sentMessages.delete(oldestKey);
        }

        console.log("Service Workerからの通知要求:", event.data);

        // 特定の薬の通知リクエスト
        if (medicineId) {
          // その薬を探す
          const medicine = medicines.find((m) => m.id === medicineId);
          if (medicine) {
            handleNotificationForMedicine(medicine);
          } else {
            // medicineが見つからなくても通知音だけは再生
            playNotificationSound();
          }
        } else {
          // 特定の薬IDがなければ、通知音だけ再生
          playNotificationSound();
        }
      }
    };

    // Service Workerからのメッセージリスナーを登録
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage
      );
      console.log("Service Workerメッセージリスナーを登録しました");
    }

    // クリーンアップ関数
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage
        );
        console.log("Service Workerメッセージリスナーを削除しました");
      }
    };
  }, [medicines, handleNotificationForMedicine, playNotificationSound]);

  if (!showNotification || !notificationMedicine) return null;

  return (
    <>
      {/* 通知ダイアログ */}
      <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg max-w-sm z-50">
        <div className="flex flex-col">
          <h3 className="font-bold text-lg text-black">お薬の時間です</h3>
          <p className="mb-2 text-black">
            {notificationMedicine.name}を服用してください
          </p>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => {
                handleNotificationClick(notificationMedicine);
                setShowNotification(false);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              服用しました
            </button>
            <button
              onClick={() => setShowNotification(false)}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
            >
              後で
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
