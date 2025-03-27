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
  }
}

type NotificationProps = {
  medicines: Medicine[];
  onNotificationClick: (id: string) => void;
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

  // 現在時刻を取得し、形式を"HH:MM"に変換する関数
  const formatCurrentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  };

  // 音声を再生する関数
  const playNotificationSound = useCallback(() => {
    // 既に再生中なら再生しない
    if (isPlaying) return;

    try {
      if (audioRef.current) {
        setIsPlaying(true);
        audioRef.current.currentTime = 0;

        // 音量を確認
        if (audioRef.current.volume === 0) {
          audioRef.current.volume = 1;
        }

        // モバイルでの自動再生制限に対応するためユーザーインタラクションを模倣
        interface AudioContextConstructor {
          new (): AudioContext;
        }

        interface Window {
          AudioContext: AudioContextConstructor;
          webkitAudioContext: AudioContextConstructor;
        }

        const AudioContextClass =
          window.AudioContext || (window as Window).webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          context
            .resume()
            .then(() => {
              console.log("AudioContext resumed successfully");
            })
            .catch((error) => {
              console.error("AudioContext resume failed:", error);
            });
        }

        const playPromise = audioRef.current.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // 再生終了時にフラグをリセット
              audioRef.current?.addEventListener(
                "ended",
                () => {
                  setIsPlaying(false);
                },
                { once: true }
              );
            })
            .catch((error) => {
              console.error("音声再生に失敗しました:", error);
              setIsPlaying(false);

              // エラーが発生した場合、再度試行
              setTimeout(() => {
                if (audioRef.current) {
                  audioRef.current.play().catch((retryError) => {
                    console.error("音声再生の再試行に失敗:", retryError);
                  });
                }
              }, 1000);
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
          // ブラウザ通知を表示
          new window.Notification("お薬の時間です", {
            body: `${medicine.name}を服用する時間です`,
            icon: "/favicon.ico", // アイコンを追加して目立たせる
            tag: `medicine-${medicine.id}`, // 同じタグの通知は上書きされる
            requireInteraction: true, // ユーザーがアクションを起こすまで通知を表示したままにする
          });
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
    if ("serviceWorker" in navigator) {
      try {
        // Service Workerを登録
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.log("Service Worker 登録成功:", registration.scope);

        // デバッグ: ServiceWorkerの状態をチェック
        console.log(
          "Service Worker 状態:",
          registration.active ? "アクティブ" : "非アクティブ"
        );
        if (navigator.serviceWorker.controller) {
          console.log(
            "ServiceWorker コントローラー存在:",
            navigator.serviceWorker.controller.scriptURL
          );
        } else {
          console.warn(
            "ServiceWorkerコントローラーがありません - 更新が必要かもしれません"
          );
          // 強制的に更新を試みる
          registration.update();
        }

        // サービスワーカーの更新をチェック
        registration.update().catch((error) => {
          console.error("Service Worker の更新に失敗:", error);
        });

        // プッシュ通知の許可を求める
        if (registration.pushManager) {
          try {
            if (notificationPermission === "granted") {
              // デバッグ: プッシュ通知のサブスクリプション状態をチェック
              registration.pushManager
                .getSubscription()
                .then((subscription) => {
                  if (subscription) {
                    console.log(
                      "既存のプッシュ通知サブスクリプション:",
                      subscription.endpoint
                    );
                  } else {
                    console.log(
                      "プッシュ通知サブスクリプションがありません、新規作成します"
                    );
                  }
                });

              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                  "BF7cGGTOLlLmP_B4nMjVH2_GFf3jSQIAn09XTKe2t9HwVLFOm0z6oJyPBa1CzC4Uxb9aXO7X_L5Xev-5nGnJkPc"
                ),
              });
              console.log("プッシュ通知の登録成功:", subscription.endpoint);
            } else {
              console.warn(
                "プッシュ通知の許可がありません:",
                notificationPermission
              );
            }
          } catch (pushError) {
            console.error("プッシュ通知の登録に失敗:", pushError);
          }
        } else {
          console.warn(
            "このブラウザはプッシュ通知マネージャーをサポートしていません"
          );
        }

        // メッセージチャネルのテスト
        if (navigator.serviceWorker.controller) {
          // デバッグテスト通知をコメントアウト
          /*
          navigator.serviceWorker.controller.postMessage({
            type: "DEBUG_TEST",
            time: new Date().toISOString(),
          });
          console.log("Service Workerにデバッグメッセージを送信しました");
          */
        }
      } catch (error) {
        console.error("Service Worker 登録失敗:", error);
      }
    } else {
      console.warn("このブラウザはService Workerをサポートしていません");
    }
  }, [notificationPermission]);

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

  // コンポーネントマウント時に通知許可をリクエストし、Service Workerを登録
  useEffect(() => {
    console.log("===============================================");
    console.log("🔔 通知コンポーネントを初期化します");
    console.log("===============================================");

    requestNotificationPermission();

    // Service Workerの登録（スマホでバックグラウンド通知に対応するため）
    registerServiceWorker();

    // Audio要素を作成
    const audio = new Audio(
      "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav"
    );
    audio.preload = "auto"; // 事前に読み込み
    audioRef.current = audio;

    // ローカルストレージから通知スケジュールを読み込み
    try {
      const schedulesJson =
        localStorage.getItem("notificationSchedules") || "[]";
      const schedules = JSON.parse(schedulesJson);

      if (schedules.length > 0) {
        console.log(
          `保存された${schedules.length}件の通知スケジュールを読み込みました`
        );

        // ページが開かれた時点で未来の通知のみを再スケジュール
        const now = new Date().getTime();
        schedules.forEach(
          (schedule: {
            id: string;
            name: string;
            time: string;
            nextNotification: number;
            daily: boolean;
          }) => {
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

            // 薬の情報から通知を再スケジュール
            console.log(
              `保存されたスケジュールから ${schedule.name} の通知を ${waitTime}ms 後に再設定します`
            );

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
        );
      }
    } catch (error) {
      console.error("保存された通知スケジュールの読み込みに失敗:", error);
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
  }, [registerServiceWorker, medicines, showNotificationAlert]);

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
            // 既存のスケジュールを取得
            const schedulesJson =
              localStorage.getItem("notificationSchedules") || "[]";
            const schedules = JSON.parse(schedulesJson);

            // 新しいスケジュールを追加（同じIDの薬がある場合は更新）
            const scheduleIndex = schedules.findIndex(
              (s: { id: string }) => s.id === medicine.id
            );
            const newSchedule = {
              id: medicine.id,
              name: medicine.name,
              time: medicine.time,
              nextNotification: notificationTime.getTime(),
              daily: medicine.daily,
            };

            if (scheduleIndex >= 0) {
              schedules[scheduleIndex] = newSchedule;
            } else {
              schedules.push(newSchedule);
            }

            // スケジュールを保存
            localStorage.setItem(
              "notificationSchedules",
              JSON.stringify(schedules)
            );
            console.log(
              `通知スケジュールをローカルストレージに保存: ${medicine.name}`
            );
          } catch (storageError) {
            console.error("スケジュール保存エラー:", storageError);
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

  // 1分ごとに薬の時間をチェック
  useEffect(() => {
    const checkMedicationTime = () => {
      const time = formatCurrentTime();
      setCurrentTime(time);
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD形式

      // 服用していない薬の中で現在時刻に一致するものを確認
      const medicineToNotify = medicines.find((medicine) => {
        // 時間が一致している
        const timeMatch = medicine.time === time;
        // 服用していない
        const notTaken = !medicine.taken;
        // 毎日服用するか、今日がまだ通知されていない
        const shouldNotify =
          medicine.daily || !reminderShown.has(`${medicine.id}-${today}`);

        return timeMatch && notTaken && shouldNotify;
      });

      if (medicineToNotify) {
        // 通知を表示
        showNotificationAlert(medicineToNotify);

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

    // 5秒ごとにチェック（確実に通知するため間隔を短く）
    const timer = setInterval(checkMedicationTime, 5000);

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
              // リマインダー通知を表示
              new window.Notification("お薬を飲み忘れていませんか？", {
                body: `${notificationMedicine.name}をまだ飲んでいないようです`,
                icon: "/favicon.ico", // アイコンを追加
                requireInteraction: true, // ユーザーの操作があるまで通知を表示し続ける
                tag: `medicine-reminder-${notificationMedicine.id}`, // 同じタグの通知は上書きされる
              });

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
                onNotificationClick(notificationMedicine.id);
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
