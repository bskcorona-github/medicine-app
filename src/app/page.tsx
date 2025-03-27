"use client";

import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import MedicineForm from "./components/MedicineForm";
import MedicineList, { Medicine } from "./components/MedicineList";
import Notification from "./components/Notification";
import TimeDisplay from "./components/TimeDisplay";

export default function Home() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);

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

  // URLパラメータから通知アクションを処理
  useEffect(() => {
    // クライアントサイドでのみ実行
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get("action");
      const id = urlParams.get("id");

      // 通知から「服用しました」ボタンがクリックされた場合
      if (action === "taken" && id) {
        // medicine-{id} または medicine-reminder-{id} から id を抽出
        const medicineId = id.replace("medicine-", "").replace("reminder-", "");

        // 該当の薬を服用済みにする
        if (medicineId) {
          handleTakeMedicine(medicineId);

          // URLパラメータをクリア
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }
      }
    }
  }, []);

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
      </div>
    </div>
  );
}
