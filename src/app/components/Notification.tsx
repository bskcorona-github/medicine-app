"use client";

import { useEffect, useState, useRef } from "react";
import useSound from "use-sound";
import { Medicine } from "./MedicineList";

// Web Notification API用の型定義
declare global {
  interface Window {
    Notification: {
      permission: string;
      requestPermission(): Promise<string>;
      new (title: string, options?: { body: string }): Notification;
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

  // 音声再生のためのref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // useSound hookを使用（バックアップ）
  const [play] = useSound("/sounds/notification.mp3", {
    volume: 1.0,
    interrupt: true, // 再生中でも新しい通知音で中断
  });

  // 現在時刻を取得し、形式を"HH:MM"に変換する関数
  const formatCurrentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  };

  // 通知を表示する関数
  const showNotificationAlert = (medicine: Medicine) => {
    // アプリ内通知を表示
    setNotificationMedicine(medicine);
    setShowNotification(true);

    // 音声通知を再生（複数の方法で試す）
    try {
      // 方法1: useSound hookを使用
      play();

      // 方法2: Audio要素を使用
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error("音声再生に失敗しました:", error);
          });
        }
      }
    } catch (error) {
      console.error("音声再生中にエラーが発生しました:", error);
    }

    // ブラウザ通知を試行
    try {
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        notificationPermission === "granted"
      ) {
        // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
        new Notification("お薬の時間です", {
          body: `${medicine.name}を服用する時間です`,
          icon: "/favicon.ico", // アイコンを追加して目立たせる
          vibrate: [200, 100, 200], // バイブレーションパターン（対応デバイスのみ）
        });
      }
    } catch (error) {
      console.error("ブラウザ通知の表示に失敗しました:", error);
    }
  };

  // 通知の許可をリクエストする関数
  const requestNotificationPermission = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
        const permission = Notification.permission;
        setNotificationPermission(permission);

        if (permission !== "granted" && permission !== "denied") {
          // 許可を求める
          // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
          const newPermission = await Notification.requestPermission();
          setNotificationPermission(newPermission);
        }
      }
    } catch (error) {
      console.error("通知の許可リクエストに失敗しました:", error);
    }
  };

  // コンポーネントマウント時に通知許可をリクエスト
  useEffect(() => {
    requestNotificationPermission();

    // Audio要素を作成
    const audio = new Audio("/sounds/notification.mp3");
    audio.preload = "auto"; // 事前に読み込み
    audioRef.current = audio;

    // コンポーネントのアンマウント時にクリーンアップ
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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

    // 5秒ごとにチェック（確実に通知するため間隔を短く）
    const timer = setInterval(checkMedicationTime, 5000);

    return () => clearInterval(timer);
  }, [medicines, reminderShown, play, notificationPermission]);

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
              // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
              new Notification("お薬を飲み忘れていませんか？", {
                body: `${notificationMedicine.name}をまだ飲んでいないようです`,
                icon: "/favicon.ico", // アイコンを追加
                requireInteraction: true, // ユーザーの操作があるまで通知を表示し続ける
              });

              // リマインダー通知の音声も再生
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current
                  .play()
                  .catch((e) =>
                    console.error("リマインダー音声の再生に失敗:", e)
                  );
              }
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
  ]);

  if (!showNotification || !notificationMedicine) return null;

  return (
    <>
      {/* 非表示音声要素 */}
      <audio
        id="notification-sound"
        src="/sounds/notification.mp3"
        preload="auto"
      />

      {/* 通知ダイアログ */}
      <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg max-w-sm z-50">
        <div className="flex flex-col">
          <h3 className="font-bold text-lg">お薬の時間です</h3>
          <p className="mb-2">{notificationMedicine.name}を服用してください</p>
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
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              後で
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
