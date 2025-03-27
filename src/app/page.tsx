"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import MedicineForm, { MedicineFormData } from "./components/MedicineForm";
import MedicineList, { Medicine } from "./components/MedicineList";
import Notification from "./components/Notification";
import TimeDisplay from "./components/TimeDisplay";
import InstallPWA from "./components/InstallPWA";

export default function Home() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  // 音声再生用ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 編集中の薬
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);

  // ローカルストレージからデータを読み込む
  useEffect(() => {
    const savedMedicines = localStorage.getItem("medicines");
    if (savedMedicines) {
      setMedicines(JSON.parse(savedMedicines));
    }
  }, []);

  // データが変更されたらローカルストレージに保存
  useEffect(() => {
    localStorage.setItem("medicines", JSON.stringify(medicines));
  }, [medicines]);

  // 通知音を再生する関数
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      // 既に再生中かどうかをチェック
      if (
        audioRef.current.currentTime > 0 &&
        !audioRef.current.paused &&
        !audioRef.current.ended
      ) {
        console.log("既に音声再生中のため、再生をスキップします");
        return;
      }

      // 念のため現在のAudioをチェック
      if (audioRef.current.error) {
        console.log(
          "エラー状態のオーディオを検出したため、新しいインスタンスを作成します"
        );
        const timestamp = new Date().getTime();
        const soundPath = "/sounds/001_zundamon_okusuri.wav";
        const newAudio = new Audio(`${soundPath}?t=${timestamp}`);
        newAudio.preload = "auto";
        audioRef.current = newAudio;
      }

      // 再生開始
      audioRef.current.currentTime = 0;

      // 再生が終了したときのイベントリスナーを一旦削除して再登録
      const onEnded = () => {
        console.log("音声再生が終了しました");
      };

      audioRef.current.removeEventListener("ended", onEnded);
      audioRef.current.addEventListener("ended", onEnded, { once: true });

      audioRef.current.play().catch((error) => {
        console.error("音声再生に失敗しました:", error);

        // 再生に失敗した場合は新しいインスタンスで再試行
        setTimeout(() => {
          const timestamp = new Date().getTime();
          const soundPath = "/sounds/001_zundamon_okusuri.wav";
          const retryAudio = new Audio(`${soundPath}?t=${timestamp}`);

          // 再生終了時のイベントリスナーを追加
          retryAudio.addEventListener(
            "ended",
            () => {
              console.log("再試行音声の再生が完了しました");
            },
            { once: true }
          );

          retryAudio.play().catch((e) => {
            console.error("再試行時も音声再生に失敗:", e);
          });
        }, 500);
      });
    }
  }, []);

  // 新しい薬を追加
  const handleAddMedicine = useCallback((data: MedicineFormData) => {
    const newMedicine: Medicine = {
      id: uuidv4(),
      name: data.medicineName,
      time: data.time,
      taken: false,
      daily: data.daily,
    };
    setMedicines((prev) => [...prev, newMedicine]);
  }, []);

  // 薬を服用済みにする
  const handleTakeMedicine = useCallback((id: string) => {
    setMedicines((prev) =>
      prev.map((medicine) =>
        medicine.id === id ? { ...medicine, taken: true } : medicine
      )
    );
  }, []);

  // 薬を削除する
  const handleDeleteMedicine = useCallback((id: string) => {
    setMedicines((prev) => prev.filter((medicine) => medicine.id !== id));

    // ローカルストレージから関連する通知スケジュールも削除
    try {
      const schedulesJson =
        localStorage.getItem("notificationSchedules") || "[]";
      const schedules = JSON.parse(schedulesJson);
      const filteredSchedules = schedules.filter(
        (schedule: { id: string }) => schedule.id !== id
      );
      localStorage.setItem(
        "notificationSchedules",
        JSON.stringify(filteredSchedules)
      );
      console.log(
        `薬ID: ${id}の通知スケジュールをローカルストレージから削除しました`
      );

      // ServiceWorkerに削除を通知
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "REMOVE_NOTIFICATION_SCHEDULE",
          medicineId: id,
        });
        console.log(
          `薬ID: ${id}の通知スケジュール削除をServiceWorkerに依頼しました`
        );
      }
    } catch (error) {
      console.error("通知スケジュールの削除に失敗しました:", error);
    }
  }, []);

  // すべての薬を削除する
  const handleDeleteAllMedicines = useCallback(() => {
    if (window.confirm("すべてのお薬を削除してもよろしいですか？")) {
      setMedicines([]);

      // ローカルストレージからすべての通知スケジュールを削除
      try {
        localStorage.setItem("notificationSchedules", "[]");
        console.log(
          "すべての通知スケジュールをローカルストレージから削除しました"
        );

        // ServiceWorkerにすべての削除を通知
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "REMOVE_ALL_NOTIFICATION_SCHEDULES",
          });
          console.log(
            "すべての通知スケジュール削除をServiceWorkerに依頼しました"
          );
        }
      } catch (error) {
        console.error("すべての通知スケジュールの削除に失敗しました:", error);
      }
    }
  }, []);

  // 薬の編集モードを開始
  const handleEditMedicine = useCallback((medicine: Medicine) => {
    setEditingMedicine(medicine);
    // フォームが見えるようにスクロール
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  // 薬を更新する
  const handleUpdateMedicine = useCallback(
    (id: string, data: MedicineFormData) => {
      setMedicines((prev) =>
        prev.map((medicine) =>
          medicine.id === id
            ? {
                ...medicine,
                name: data.medicineName,
                time: data.time,
                daily: data.daily,
              }
            : medicine
        )
      );
      setEditingMedicine(null);
    },
    []
  );

  // 編集をキャンセル
  const handleCancelEdit = useCallback(() => {
    setEditingMedicine(null);
  }, []);

  // URL パラメータの処理
  useEffect(() => {
    if (typeof window !== "undefined") {
      // パラメータの取得
      const params = new URLSearchParams(window.location.search);
      const action = params.get("action");
      const id = params.get("id");
      const notification = params.get("notification");

      console.log("URLパラメータを検出:", { action, id, notification });

      // サービスワーカーからのリダイレクトの場合（通知音を再生）
      if (notification === "sound") {
        console.log("通知音再生リクエストを検出");
        playNotificationSound();

        // 対象のお薬IDがある場合
        if (id) {
          console.log(`お薬ID ${id} の通知を処理`);
          // 服用済みでない場合だけ処理
          const medicine = medicines.find((m) => m.id === id && !m.taken);
          if (medicine) {
            // 服用済みかどうかの確認ダイアログを表示
            const confirmed = window.confirm(
              `${medicine.name}を服用しましたか？\n\n「OK」を押すと服用済みになります。\n「キャンセル」を押すと後で通知します。`
            );
            if (confirmed) {
              handleTakeMedicine(id);
            }
          }
        }

        // URLパラメータをクリア（ユーザーが戻るボタンを押したときにループしないように）
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
        return;
      }

      // Service Workerからの通知アクションの処理
      if (action === "taken" && id) {
        console.log(`服用完了アクション: ${id}`);
        handleTakeMedicine(id);

        // URLパラメータをクリア
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
        return;
      }

      // 新規追加アクション
      if (action === "add") {
        console.log("新規追加アクション");
        // 編集中の薬をリセット（新規追加モードにする）
        setEditingMedicine(null);

        // URLパラメータをクリア
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // フォームが見えるようにスクロール
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    }
  }, [medicines, handleTakeMedicine, playNotificationSound]);

  // Service Workerからのメッセージを受信する
  useEffect(() => {
    // Audio要素の作成と事前読み込み（キャッシュバスティングを追加）
    const timestamp = new Date().getTime();
    const soundPath = "/sounds/001_zundamon_okusuri.wav";
    const audio = new Audio(`${soundPath}?t=${timestamp}`);
    audio.preload = "auto"; // 事前に読み込み
    audioRef.current = audio;

    // 音声読み込みエラーのハンドリングを追加
    audio.addEventListener("error", (e) => {
      console.error("音声読み込みエラー:", e);
      console.error("音声ファイルパス:", audio.src);
      // エラー発生時に再試行
      setTimeout(() => {
        const newTimestamp = new Date().getTime();
        const retryAudio = new Audio(`${soundPath}?t=${newTimestamp}`);
        retryAudio.preload = "auto";
        audioRef.current = retryAudio;
      }, 1000);
    });

    // 一度再生して許可を得る（自動再生ポリシー対策）
    const initAudio = () => {
      // ユーザーの操作があった時のみ実行
      document.addEventListener(
        "click",
        function initAudioOnUserAction() {
          if (audioRef.current) {
            audioRef.current.volume = 0; // 無音で再生
            audioRef.current
              .play()
              .then(() => {
                audioRef.current!.pause();
                audioRef.current!.volume = 1; // 元の音量に戻す
                console.log("音声の初期化が完了しました");
              })
              .catch((error) => {
                console.error("音声の初期化に失敗しました:", error);
              });
          }
          // 一度だけ実行したいので、リスナーを削除
          document.removeEventListener("click", initAudioOnUserAction);
        },
        { once: true }
      );
    };

    initAudio();

    // Service Workerからのメッセージを処理
    let lastNotificationTime = 0;
    const NOTIFICATION_DEBOUNCE_MS = 2000; // 2秒以内の重複通知を防止

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      console.log(
        "メインスレッド: Service Workerからメッセージを受信",
        event.data
      );

      // 通知音再生のメッセージ
      if (event.data?.type === "PLAY_NOTIFICATION_SOUND") {
        const now = Date.now();
        const timeSinceLastNotification = now - lastNotificationTime;

        if (timeSinceLastNotification < NOTIFICATION_DEBOUNCE_MS) {
          console.log(
            `最近(${timeSinceLastNotification}ms前)に通知音を再生したため、スキップします`
          );
          return;
        }

        lastNotificationTime = now;

        const medicineId = event.data.medicineId;
        console.log("Service Workerからメッセージを受信:", event.data);

        // 特定の薬の通知の場合
        if (medicineId) {
          const medicine = medicines.find((m) => m.id === medicineId);
          if (medicine) {
            console.log("特定の薬の通知:", medicine);
            playNotificationSound();
          }
        } else {
          // どの薬か特定できない場合でも通知音を再生
          playNotificationSound();
        }
      }
    };

    // メッセージイベントリスナーを登録
    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage
    );

    // クリーンアップ関数
    return () => {
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage
      );
    };
  }, [medicines, playNotificationSound]);

  // 日付が変わったら服用状態をリセット
  useEffect(() => {
    const resetTakenStatus = () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        setMedicines(
          medicines.map((medicine) => ({ ...medicine, taken: false }))
        );
      }
    };

    const interval = setInterval(resetTakenStatus, 60000); // 1分ごとにチェック
    return () => clearInterval(interval);
  }, [medicines]);

  // PWAでのインストールをサポートするための処理
  useEffect(() => {
    // PWAのインストール状態を確認
    const isPwa = () => {
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true
      );
    };

    // PWAとしてインストールされているかをログに記録
    console.log(`PWAとしてインストールされている: ${isPwa()}`);

    // ServiceWorkerが利用可能か確認
    if ("serviceWorker" in navigator) {
      // ServiceWorkerの状態を確認
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (registration) {
            console.log("Service Worker登録済み:", registration.scope);

            // Service Workerの更新を確認
            registration.update().catch((err) => {
              console.error("Service Worker更新エラー:", err);
            });
          } else {
            console.log("Service Worker未登録");
          }
        })
        .catch((err) => {
          console.error("Service Worker確認エラー:", err);
        });
    } else {
      console.warn("このブラウザはService Workerをサポートしていません");
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl font-bold text-center mb-8">
          おくすりリマインダー
        </h1>

        <TimeDisplay />

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <MedicineForm
              onAddMedicine={handleAddMedicine}
              onUpdateMedicine={handleUpdateMedicine}
              editingMedicine={editingMedicine}
              onCancelEdit={handleCancelEdit}
            />
          </div>

          <div>
            <MedicineList
              medicines={medicines}
              onTakeMedicine={handleTakeMedicine}
              onDeleteMedicine={handleDeleteMedicine}
              onEditMedicine={handleEditMedicine}
              onDeleteAllMedicines={handleDeleteAllMedicines}
            />
          </div>
        </div>

        <Notification
          medicines={medicines}
          onNotificationClick={handleTakeMedicine}
        />

        <InstallPWA />
      </div>
    </div>
  );
}
