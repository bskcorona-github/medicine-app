"use client";

import { useEffect, useState, useRef } from "react";
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
  const playNotificationSound = () => {
    // 既に再生中なら再生しない
    if (isPlaying) return;

    try {
      if (audioRef.current) {
        setIsPlaying(true);
        audioRef.current.currentTime = 0;
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
            });
        }
      }
    } catch (error) {
      console.error("音声再生中にエラーが発生しました:", error);
      setIsPlaying(false);
    }
  };

  // 通知を表示する関数
  const showNotificationAlert = (medicine: Medicine) => {
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
        // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
        new Notification("お薬の時間です", {
          body: `${medicine.name}を服用する時間です`,
          icon: "/favicon.ico", // アイコンを追加して目立たせる
          vibrate: [200, 100, 200], // バイブレーションパターン（対応デバイスのみ）
          tag: `medicine-${medicine.id}`, // 同じタグの通知は上書きされる
          requireInteraction: true, // ユーザーがアクションを起こすまで通知を表示したままにする
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

  // Service Workerを登録する関数
  const registerServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
      try {
        // Service Workerを登録
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Service Worker 登録成功:", registration);

        // プッシュ通知の許可を求める
        if (registration.pushManager) {
          try {
            // @ts-expect-error - WindowのNotificationオブジェクトへのアクセス
            if (Notification.permission === "granted") {
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(
                  "BF7cGGTOLlLmP_B4nMjVH2_GFf3jSQIAn09XTKe2t9HwVLFOm0z6oJyPBa1CzC4Uxb9aXO7X_L5Xev-5nGnJkPc"
                ),
              });
              console.log("プッシュ通知の登録成功:", subscription);
            }
          } catch (pushError) {
            console.error("プッシュ通知の登録に失敗:", pushError);
          }
        }
      } catch (error) {
        console.error("Service Worker 登録失敗:", error);
      }
    }
  };

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
    requestNotificationPermission();

    // Service Workerの登録（スマホでバックグラウンド通知に対応するため）
    registerServiceWorker();

    // Audio要素を作成
    const audio = new Audio(
      "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav"
    );
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
  }, [medicines, reminderShown, notificationPermission]);

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
  ]);

  if (!showNotification || !notificationMedicine) return null;

  return (
    <>
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
