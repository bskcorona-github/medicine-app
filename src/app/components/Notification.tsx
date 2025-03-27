"use client";

import { useEffect, useState } from "react";
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
  const [_currentTime, setCurrentTime] = useState<string>("");
  const [notificationMedicine, setNotificationMedicine] =
    useState<Medicine | null>(null);
  const [showNotification, setShowNotification] = useState<boolean>(false);
  const [reminderShown, setReminderShown] = useState<Set<string>>(new Set());

  // 実際の音声ファイルがあれば有効化してください
  const [play] = useSound("/sounds/notification.mp3", { volume: 0.5 });

  // 現在時刻を取得し、形式を"HH:MM"に変換する関数
  const formatCurrentTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
  };

  // 通知の許可をリクエストする関数
  const requestNotificationPermission = async () => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
        const permission = Notification.permission;
        if (permission !== "granted" && permission !== "denied") {
          // 許可を求める
          // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
          await Notification.requestPermission();
        }
      }
    } catch (error) {
      console.error("通知の許可リクエストに失敗しました:", error);
    }
  };

  useEffect(() => {
    // 通知許可をリクエスト
    requestNotificationPermission();

    // 1分ごとに現在時刻を更新
    const timer = setInterval(() => {
      const time = formatCurrentTime();
      setCurrentTime(time);

      // 服用していない薬の中で現在時刻に一致するものがあるか確認
      const medicineToNotify = medicines.find(
        (medicine) =>
          medicine.time === time &&
          !medicine.taken &&
          !reminderShown.has(`${medicine.id}-${time}`)
      );

      if (medicineToNotify) {
        setNotificationMedicine(medicineToNotify);
        setShowNotification(true);
        // 通知済みとしてマーク
        setReminderShown((prev) =>
          new Set(prev).add(`${medicineToNotify.id}-${time}`)
        );

        // 音声再生
        play();

        // Web Notifications APIの機能チェック
        try {
          if (typeof window !== "undefined" && "Notification" in window) {
            // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
            if (Notification.permission === "granted") {
              // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
              new Notification("お薬の時間です", {
                body: `${medicineToNotify.name}を服用する時間です`,
              });
            }
          }
        } catch (error) {
          console.error("通知の表示に失敗しました:", error);
        }
      }
    }, 60000); // 1分ごとに確認

    // 初回実行
    setCurrentTime(formatCurrentTime());

    return () => clearInterval(timer);
  }, [medicines, reminderShown, play]);

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
              // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
              Notification.permission === "granted"
            ) {
              // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
              new Notification("お薬を飲み忘れていませんか？", {
                body: `${notificationMedicine.name}をまだ飲んでいないようです`,
              });
            }
          } catch (error) {
            console.error("リマインダー通知の表示に失敗しました:", error);
          }
        }
        setShowNotification(false);
      }, 10000); // 10秒後

      return () => clearTimeout(reminderTimeout);
    }
  }, [notificationMedicine, showNotification, medicines]);

  if (!showNotification || !notificationMedicine) return null;

  return (
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
  );
}
