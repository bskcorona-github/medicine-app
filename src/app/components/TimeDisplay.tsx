"use client";

import { useState, useEffect } from "react";

export default function TimeDisplay() {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      // 時刻の表示形式を設定
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      setCurrentTime(`${hours}:${minutes}:${seconds}`);

      // 日付の表示形式を設定
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      setCurrentDate(`${year}年${month}月${day}日`);
    };

    // 初回実行
    updateTime();

    // 1秒ごとに更新
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center mb-6">
      <p className="text-xl font-bold">{currentDate}</p>
      <p className="text-4xl font-mono">{currentTime}</p>
    </div>
  );
}
