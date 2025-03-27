"use client";

import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import MedicineForm from "./components/MedicineForm";
import MedicineList, { Medicine } from "./components/MedicineList";
import Notification from "./components/Notification";
import TimeDisplay from "./components/TimeDisplay";
import InstallPWA from "./components/InstallPWA";

export default function Home() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  // 音声再生用ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        console.error("音声再生に失敗しました:", error);
      });
    }
  };

  // 新しい薬を追加
  const handleAddMedicine = (data: {
    medicineName: string;
    time: string;
    daily: boolean;
  }) => {
    const newMedicine: Medicine = {
      id: uuidv4(),
      name: data.medicineName,
      time: data.time,
      taken: false,
      daily: data.daily,
    };
    setMedicines([...medicines, newMedicine]);
  };

  // 薬を服用済みにする
  const handleTakeMedicine = (id: string) => {
    setMedicines(
      medicines.map((medicine) =>
        medicine.id === id ? { ...medicine, taken: true } : medicine
      )
    );
  };

  // URLパラメータから通知アクションを処理
  useEffect(() => {
    // クライアントサイドでのみ実行
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get("action");
      const id = urlParams.get("id");
      const notification = urlParams.get("notification");

      console.log("URLパラメータを検出:", { action, id, notification });

      // 通知から「服用しました」ボタンがクリックされた場合
      if (action === "taken" && id) {
        // medicine-{id} または medicine-reminder-{id} から id を抽出
        const medicineId = id.replace("medicine-", "").replace("reminder-", "");

        // 該当の薬を服用済みにする
        if (medicineId) {
          console.log("服用済みアクションを実行します:", medicineId);
          handleTakeMedicine(medicineId);

          // URLパラメータをクリア
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }
      }

      // 通知音を再生する場合
      if (notification === "sound") {
        console.log("通知音を再生します");
        // モバイルでの自動再生制限に対応するため遅延させる
        setTimeout(() => {
          playNotificationSound();
        }, 1000);

        // URLパラメータをクリア
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    }
  }, [handleTakeMedicine, playNotificationSound]);

  // Service Workerからのメッセージを受信する
  useEffect(() => {
    // Audio要素の作成と事前読み込み
    const audio = new Audio(
      "/sounds/001_ずんだもん（ノーマル）_おくすりのじかんだ….wav"
    );
    audio.preload = "auto"; // 事前に読み込み
    audioRef.current = audio;

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

    // Service Workerからのメッセージリスナー
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      console.log(
        "メインスレッド: Service Workerからメッセージを受信",
        event.data
      );

      if (event.data && event.data.type === "PLAY_NOTIFICATION_SOUND") {
        // 音声を再生
        playNotificationSound();

        // 薬のIDが含まれていれば、その薬を取得して通知表示
        if (event.data.medicineId) {
          const medicine = medicines.find(
            (m) => m.id === event.data.medicineId
          );
          if (medicine) {
            // 通知コンポーネントに薬の情報を渡して表示する処理をここに追加できる
            console.log("特定の薬の通知:", medicine);
          }
        }
      }
    };

    // Service Workerが有効かどうかをチェック
    if ("serviceWorker" in navigator) {
      // Service Workerの登録状態を確認
      navigator.serviceWorker.ready.then((registration) => {
        console.log("Service Worker is ready:", registration.scope);
      });

      // メッセージリスナーを登録
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage
      );
    } else {
      console.warn("このブラウザはService Workerをサポートしていません");
    }

    // クリーンアップ関数
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage
        );
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-2xl font-bold text-center mb-8">
          おくすりリマインダー
        </h1>

        <TimeDisplay />

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <MedicineForm onAddMedicine={handleAddMedicine} />
          </div>

          <div>
            <MedicineList
              medicines={medicines}
              onTakeMedicine={handleTakeMedicine}
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
